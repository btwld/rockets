# Rockets Core / Server Architecture (MANDATORY)

These rules come from repeated corrections during the core-extraction work
(April 2026). Violating them wastes the user's time and will be caught.
Full context: `SYSTEM_DESIGN.md`, `DESIGN_SPEC.md`.

## Package Layer Boundaries

```
rockets-common       shared utils, zero framework opinion
rockets-repository   abstract data access (default contract; no ORM in the type layer)
                      adapters: TypeOrm, Firestore, others — pluggable per app
rockets-crud         generic CRUD
rockets-access-control ACL/RBAC
    ▲
rockets-core         framework integration: auth, guard, CQRS, resources, context overlay
    ▲
rockets (server)     composition root: MeController, Swagger, APP_GUARD, settings
```

**Core = shared infrastructure.** Anything that `rockets-server-auth` also
needs belongs in `rockets-core`. Examples: `AuthServerGuard`,
`AUTH_ADAPTER_TOKEN`, `AuthorizedUserOverlay`, CQRS handlers, resource
wiring.

**Server = presentation + composition.** Anything that is product-specific
or a presentation concern belongs in `rockets` (the server package).
Examples: `MeController`, `APP_GUARD` opt-in, settings.

**Rule:** Before placing a component in core or server, ask:
"Would `rockets-server-auth` also want this?"
- Yes → core
- No → server

## DO NOT

1. **Do NOT put controllers or presentation-only concerns in
   `rockets-core`.** Controllers live in the server or auth packages.
   `SwaggerUiModule` IS registered in core (both server and auth need it).
2. **Do NOT use `@InjectRepository` from `@nestjs/typeorm` in new code.** Use
   `@InjectDynamicRepository(ENTITY_KEY)` + `RepositoryInterface<Entity>` from
   `@bitwild/rockets-repository`. Register the entity through a bundle in
   `resources[]` (`defineResource()` or `defineModuleResource()`) or via
   `userMetadata.entity` — never via a module-local
   `TypeOrmModule.forFeature()`. The default adapter is the single
   top-level `repository: RepositoryModuleInterface` field.
3. **Do NOT design `rockets-core` so the default or only story is “you must use
   TypeORM”.** The repository package is the abstraction; ORM-specific code belongs
   in the chosen `RepositoryModule` / adapter, or in the application — not in core
   as an undeclared dependency. If a feature would break when the adapter is not
   TypeORM, refactor so the contract is `RepositoryInterface` (or a neutral DTO
   in core) and adapter-specific bits stay in the right layer.
4. **Do NOT nest `crud.crud` in resource config.** `RocketsResourceConfig`
   extends `CrudModuleForFeatureOptionsInterface` directly. The shape is
   `{ crud: { controller, operations }, providers? }`.
5. **Do NOT declare handlers twice.** If a handler is referenced in
   `operations[].queryHandler` or `operations[].commandHandler`, core
   auto-extracts it as a provider. Only add to `resource.providers` if it is
   NOT already in an operation (e.g. a shared service).
6. **Do NOT hand-list entities at the root.** Each `defineResource()`
   auto-contributes its entity row; `defineModuleResource({ entities: [...] })`
   contributes additional rows; `userMetadata.entity` contributes the
   metadata row. The root `repository` is a single `RepositoryModuleInterface`,
   not a list. Per-entity adapter overrides live inside the bundle (or
   on `userMetadata.repository`) for mixed-store apps.
7. **Do NOT mutate `definition.imports` in a `definitionTransform` without
   merging `defImports`.** The `ConfigurableModuleBuilder` provides async
   wiring (`RAW_OPTIONS_TOKEN`) through `defImports` — losing them silently
   breaks `forRootAsync` injection.
8. **Do NOT add "workarounds" (bridge modules, lazy resolution placeholders,
   `as unknown as Type`, `--no-verify`).** If stuck, STOP and ASK the user.
9. **Do NOT add unused fields to interfaces.** If a field isn't actively
   consumed, it doesn't exist. Remove it.
10. **Do NOT trust IDE auto-imports blindly.** `@Expose` (class-transformer)
   is NOT `@ApiProperty` (@nestjs/swagger). Verify the symbol you imported is
   the one you meant.
11. **Do NOT declare "done" without running `tsc --noEmit` or booting the
    app.** A file that the IDE shows as green can still have unimported
    symbols that ts-node catches at runtime.
12. **Do NOT assume the user is right.** When asked "analise isso", do
    independent analysis and push back if the premise is wrong.
13. **Do NOT export every provider from a module resource.** Only export
    what other bundles or outer factories actually inject. Internal
    helpers, formatters, hooks, and command/query handlers used only by
    that bundle's controller stay in `providers` without `exports`.
    `RocketsCoreModule` re-exports the materialised feature module
    globally — every name you list in `exports` becomes globally
    injectable, with the usual DI risks (silent name collisions, last
    write wins). Pattern:

    ```typescript
    // ❌ Wrong — exposes internal state, risks name collision
    defineModuleResource({
      module: {
        providers: [PriceFormatter, InvoiceService, AuditHook],
        exports:   [PriceFormatter, InvoiceService, AuditHook], // why?
      },
    })

    // ✅ Right — only the cross-bundle facade is global
    defineModuleResource({
      module: {
        providers: [PriceFormatter, InvoiceService, AuditHook, BillingFacade],
        exports:   [BillingFacade], // single, intentional public surface
      },
    })
    ```

    Naming defense: when an exported provider could collide with another
    bundle's, prefix it (`BillingPriceFormatter`) or use an injection
    token (`BILLING_PRICE_FORMATTER_TOKEN`).

## Persistence: database-agnostic (summary)

- App and domain code depend on `RepositoryInterface` and dynamic keys, not on a
  specific SQL engine or ORM.
- The root `repository` field accepts any `RepositoryModuleInterface`
  (`TypeOrmRepositoryModule`, `FirestoreRepositoryModule`, …). Bundles may
  override per-entity via `entry.repository` inside
  `defineModuleResource({ entities: [...] })`, or via `userMetadata.repository`,
  to host one table on a different store.
- Documented examples often use `TypeOrmRepositoryModule` as the common
  default; that is one option, not the contract.
- New work in `rockets-core` must stay valid when the repository implementation
  is not TypeORM.

## DO

1. **Use the Context Overlay System for authenticated user access in CRUD
   handlers.**
   ```typescript
   import { getAuthorizedUserFromCrudContext } from '@bitwild/rockets-core';
   const authUser = getAuthorizedUserFromCrudContext(context);
   ```
   No parameter drilling, no request mutation, no custom decorators on
   generated controllers.

2. **Register entities through bundles, not at the root.** One default
   adapter; entities flow in through `defineResource()` /
   `defineModuleResource()` / `userMetadata`:
   ```typescript
   RocketsCoreModule.forRoot({
     authProvider,
     repository: TypeOrmRepositoryModule, // any RepositoryModuleInterface
     userMetadata: { entity: UserMetadataEntity },
     resources: [
       // CRUD: entity auto-registered under key 'pet'.
       defineResource({ key: 'pet', entity: PetEntity, path: 'pets' }),

       // Non-CRUD: explicit keyed entities + Nest slice.
       defineModuleResource({
         entities: [
           { key: 'pet-share', entity: PetShareEntity },
           { key: 'audit-log', entity: AuditLogEntity },
         ],
         module: {
           controllers: [PetShareController],
           providers: [PetShareService, OwnerOrSharedHook],
         },
       }),

       // Mixed store: this one entity lives in Firestore.
       defineModuleResource({
         entities: [{
           key: 'analytics-event',
           entity: AnalyticsEventEntity,
           repository: FirestoreRepositoryModule,
         }],
         module: { providers: [AnalyticsService] },
       }),
     ],
   })
   ```

3. **Inject repositories dynamically:**
   ```typescript
   import { InjectDynamicRepository, RepositoryInterface, Where } from '@bitwild/rockets-repository';

   constructor(
     @InjectDynamicRepository('user')
     private readonly userRepo: RepositoryInterface<UserEntity>,
   ) {}

   await this.userRepo.findOne({ where: Where.eq<UserEntity>('email', email) });
   ```

4. **Declare resources as factory functions returning
   `RocketsResourceConfig`:**
   ```typescript
   export function createPetResource(): RocketsResourceConfig {
     return {
       crud: {
         controller: { path, entity, resolver, response, extraDecorators },
         operations: [
           { operation: Operation.Create, request: { body: PetCreateDto },
             command: CrudCreateCommand, commandHandler: PetCreateHandler },
           // ...
         ],
       },
       providers: [], // only non-handler providers
     };
   }
   ```

5. **Every DTO field that must appear in Swagger needs `@ApiProperty()` or
   `@ApiPropertyOptional()`.** The `@nestjs/swagger` CLI plugin is NOT
   enabled in this project. TypeScript type inference alone will NOT
   populate Swagger schemas. Class-level `@Exclude()` from class-transformer
   is unrelated to Swagger and must not be used to "expose" fields.

6. **After non-trivial edits, verify compilation:**
   ```bash
   cd examples/sample-server && npx tsc --noEmit
   # or boot it
   npx ts-node src/main.ts
   ```
   Especially after adding decorators or imports.

7. **When refactoring across packages, read `SYSTEM_DESIGN.md` (why) and
   `DESIGN_SPEC.md` (how) first.** Don't re-derive the layer boundaries from
   the code.

8. **Use repository hooks, not interceptors, for data-layer rules.** For
   anything that filters/mutates repository operations per request (owner
   scoping, tenant scoping, soft delete policies, audit fields), use the
   `@EntityHook({ entity })` class decorator from `@bitwild/rockets-core`.
   The decorator auto-applies `@Specification(RepoSpec.isEntity(<key>))`
   so the hook only fires on its own entity's operations — internal
   writes to other entities (audit logs, share rows, …) never
   re-trigger it. Hooks:
   - Run at the repository layer, so they also catch direct (non-HTTP)
     repository calls.
   - Return a new `options` object — no overlay mutation tricks.
   - Apply via the resource's `hooks: [...]` array (auto-contributed to
     the resource's DI providers — no separate `providers: [...]` entry).

   **For owner scoping use `OwnerScopeHook.for(Entity)` (reads) paired
   with `OwnerStampHook.for(Entity)` (writes).** Both factories produce
   a cached per-entity subclass decorated with `@EntityHook({ entity })`.
   The optional second arg overrides the ownership column (default
   `userId`).

   ```typescript
   import { OwnerScopeHook, OwnerStampHook } from '@bitwild/rockets-core';
   import { defineResource } from '@bitwild/rockets';

   defineResource({
     entity: PetEntity,
     hooks: [
       OwnerStampHook.for(PetEntity),   // create/update: stamp userId
       OwnerScopeHook.for(PetEntity),   // list/read/update/delete: filter
     ],
     operations: { /* … */ },
   });
   ```

   **Never list the abstract hook class itself in `hooks: [...]` or as
   a provider.** The factory class is abstract; only the per-entity
   subclass returned by `.for(Entity)` is instantiable. The same rule
   applies to `AuditLogHook.for(Entity)`, `PathScopeHook.for(Entity,
   paramName, fkColumn)`, and `AfterCreateReloadHook.for(Entity)`.

   **Hooks silently no-op if `HookModule` is not registered.** `rockets-core`
   registers `HookModule.forRoot({})` in `createCoreImports()` — do NOT
   remove it. Without it, `HookResolverService` is undefined in DI, the
   TypeORM repository factory receives `hookResolver: undefined`, and every
   `@RepoHook`-decorated method becomes dead code with zero error message.
   If a hook doesn't fire, **check that `HookModule` is still in
   `rockets-core.module-definition.ts` first**.

## Startup Flow (for reference)

```
RocketsModule.forRoot/forRootAsync(options)
  └── server.definitionTransform
        ├── imports: [...defImports, RocketsCoreModule.forRootAsync(...)]
        ├── controllers: [MeController]
        └── providers: [APP_GUARD, settings]

RocketsCoreModule.forRoot/forRootAsync(coreOptions, extras)
  └── core.definitionTransform
        │   plan = buildAppRegistrationPlan({ resourceDefinitions, repository, userMetadata })
        ├── imports: [...defImports, CqrsModule, ConfigModule, HookModule.forRoot({}),
        │             RepositoryModule.forRoot({}),
        │             ...plan.repositoryPersistence.map(p => RepositoryModule.forFeature(p)),
        │             ...plan.featureModules,        // defineModuleResource() Nest slices
        │             CrudModule.forRoot({}),
        │             ...plan.resources.map(r => CrudModule.forFeature(r))]
        ├── providers: [AUTH_ADAPTER_TOKEN, AuthServerGuard, AuthorizedUserOverlay,
        │               UserMetadata CQRS handlers, ...extractResourceProviders(plan.resources)]
        └── exports: [..., ...resource providers globally]
```

If `imports` in either `definitionTransform` does not start with
`...defImports`, the async factory wiring is broken. This is the #1 most
common regression during edits — check it every time.
