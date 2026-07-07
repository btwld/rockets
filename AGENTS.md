# AGENTS.md

Canonical agent instructions for this repository.

`CLAUDE.md` is intentionally a symlink to this file so different agents load the same project guidance.
Additional scoped rules live in `.claude/rules/`.

## Start Here

1. Read this file end-to-end before editing.
2. Open the `README.md` of the package you are about to change.
3. If anything in this file conflicts with the actual code in `packages/*/src/`, **the code wins** — and fix this file in the same PR.

## Hard-Learned Rules (Read Before Editing)

These are lessons from repeated corrections. Violating them repeats mistakes
the user has already had to fix more than once.

1. **Layer discipline — core vs server.**
   `rockets-core` = shared infrastructure (auth abstraction, guard, CQRS,
   declarative resources, repository config, Swagger UI registration).
   `rockets` (server) = presentation + composition for external auth
   integration (`MeController`, `APP_GUARD` opt-in).
   Before placing a component, ask:
   *"Would `rockets-server-auth` also need this?"* Yes → core. No → server.
   **Controllers belong in server or auth, never in core. Swagger IS in
   core** (both server and auth need API docs from a single registration).
   Access control is core too: the opt-in `accessControl` option on
   `RocketsCoreModule` / `RocketsModule` registers upstream
   `@concepta/nestjs-access-control`; when omitted, no ACL wiring exists.

2. **Dynamic repository, not `@InjectRepository`.** In new code, use
   `@InjectDynamicRepository(KEY)` + `RepositoryInterface<Entity>`. **Features
   built on top of core import these from `@bitwild/rockets-core`** (it
   re-exports the repository abstraction — `InjectDynamicRepository`,
   `RepositoryInterface`, `RepositoryModuleInterface`, `Where`,
   `getDynamicRepositoryToken` — so feature/server code never depends on
   the upstream repository package directly). The symbols originate in
   `@concepta/nestjs-repository`; only core and adapter packages import them
   from there. Register entities through bundles inside
   `resources[]` (`defineResource()` auto-contributes its entity row;
   `defineModuleResource({ entities: [...] })` contributes additional
   rows) plus `userMetadata.entity` for the metadata row — never via a
   module-local `TypeOrmModule.forFeature()`. The default adapter is the
   single top-level `repository: RepositoryModuleInterface` field.
   `rockets-server-auth` exposes **`defineRocketsAuth()`**, which contributes
   auth entity rows to the same `resources[]` / planner pipeline as core.
   Do not register the same auth keys twice.

3. **Resource config is flat.** `RocketsResourceConfig` extends
   `CrudModuleForFeatureOptionsInterface` directly. No `crud.crud` nesting.
   Handlers declared in `operations[].queryHandler` / `commandHandler` are
   auto-extracted by core — do NOT duplicate them in `resource.providers`.

4. **One `repository` adapter at the root, every bundle owns its own
   entity.** `RocketsCoreModule` / `RocketsModule` options carry a single
   top-level `repository: RepositoryModuleInterface` (default adapter)
   plus a `userMetadata` config (`entity` + DTOs, optional per-entity
   `repository` override). All other persistence rows are contributed by
   bundles inside `resources[]`:
   - `defineResource()` — CRUD-shaped, auto-contributes its entity row.
   - `defineModuleResource({ entities, module })` — non-CRUD persistence
     and/or Nest module slice (controllers/providers/exports/imports).
     Per-entity `repository` overrides the root adapter for that one
     table; bundles with `entities: []` are valid and useful for
     CQRS-only workflows.
   There is **no** `repositories.entities[]` block any more — registering
   the same entity in two places (or splitting key + class across files)
   is what this rule prevents.

5. **Never lose `defImports` in a `definitionTransform`.** Always merge:
   `imports: [...defImports, ...createCoreImports(extras)]`. Otherwise the
   `forRootAsync` wiring (RAW_OPTIONS_TOKEN) silently breaks. Check this
   every time a module-definition file is edited.

6. **Every DTO field that must show in Swagger needs `@ApiProperty()` or
   `@ApiPropertyOptional()`.** The `@nestjs/swagger` CLI plugin is NOT
   enabled. Type inference alone will not populate the schema. `@Expose()`
   from class-transformer is unrelated to Swagger.

7. **Verify compilation after edits.** Do not declare done based on IDE
   green state alone. Run `npx tsc --noEmit` or boot the app with
   `npx ts-node src/main.ts` / `yarn workspace sample-server start:dev`.
   Missing imports and wrong-package auto-imports are caught at runtime,
   not in the IDE.

8. **Do not trust IDE auto-imports.** `@Expose` from `class-transformer`
   is NOT `@ApiProperty` from `@nestjs/swagger`. Verify the imported symbol
   actually does what you intend.

9. **No workarounds — ASK instead.** Bridge modules, lazy resolution
   placeholders, `as unknown as Type`, `--no-verify`, fake providers: all
   forbidden. If stuck, stop and ask the user.

10. **No unused fields in interfaces.** If a field is not actively consumed,
    remove it.

11. **Do not assume the user is right.** When asked to analyze, do
    independent analysis and push back if the premise is wrong.

12. **READ before editing.** Open the file, understand the surrounding
    code, THEN modify. Do not edit blindly based on a diff alone.

13. **Persistence is database-agnostic by default.** The supported contract is
    `RepositoryInterface` and dynamic repository keys in `@concepta/nestjs-repository`
    (re-exported by `@bitwild/rockets-core`). Concrete backends (TypeORM, Firestore,
    other adapters) are **selected in module options** and must remain **swappable**.
    `rockets-core` public design, types, and docs must not hard-require a specific
    ORM — the zod layer stays ORM-free by delegating entity generation to a
    `SchemaEntityCompiler` adapter. Example configs may use TypeORM as a common
    case; that does not make TypeORM the definition of Rockets storage.

14. **Module resource exports are a public surface — export the minimum.**
    `defineModuleResource({ module: { providers, exports } })` materialises
    a Nest dynamic module that `RocketsCoreModule` re-exports globally
    (because core is `global: true`). That makes every entry in `exports`
    injectable from anywhere in the app — including the
    `inject: [...]` factory of `RocketsModule.forRootAsync`. Powerful,
    but also dangerous: collisions are by **injection token**. Two module
    resources exporting the **same token** — the same class reference, or
    the same string/symbol token value — shadow each other in the DI
    container (Nest accepts both, the last one wins, and the bug surfaces
    in production). Two *distinct* classes that merely share a name
    (`PriceFormatter`, `AuditService`, `Logger`) are *different* tokens
    and don't hard-collide, but they are a real readability/foot-gun
    hazard — treat them the same way.

    **Exposure rule:**
    - Provider/service crosses a feature boundary (injected by another
      bundle, or by an outer factory's `inject:`) → put in `providers`
      **and** `exports`.
    - Internal use only (helpers, formatters, hooks applied via
      `extraDecorators` on the bundle's own controller, services
      private to the bundle) → `providers` only.

    When you must export a name that could collide, prefix it
    (`BillingPriceFormatter`) or use an injection token
    (`BILLING_PRICE_FORMATTER_TOKEN`). The sample-server's `authFeature`
    is the canonical reference: it exports only `SampleAuthAdapter`
    (the symbol the outer `useFactory` injects); `AuthController` and
    the entity stay internal.

## How to work with the project owner

When replying to the project owner or maintainer:

- Prefer **short, direct answers** and **code** when it clarifies behavior; avoid
  filler and over-long essays.
- Treat this codebase as **high quality bar**: designs should remain valid if the
  **repository adapter** (or database) is swapped, not only under one ORM.
- This section encodes their preferences for assistants; it is not a technical
  dependency of the build.

## Scope & Precedence

- This root `AGENTS.md` is the default instruction set for the whole repository.
- `.claude/rules/*.md` provide scoped, glob-filtered rules (TypeScript, build/test/lint, editing).
- If a future subdirectory adds its own `AGENTS.md`, treat that as a scoped override for files in that subtree.
- When instructions conflict, prefer the most specific instruction file for the file path being edited.

## Repository Map

The engine is the upstream `@concepta/nestjs-*` stack consumed from npm
(`nestjs-core`, `nestjs-repository`, `nestjs-crud`, `nestjs-authentication`,
`nestjs-access-control`, plus the identity modules used by server-auth).
The `@bitwild/*` packages are composition + curated re-exports on top of it.

- `packages/rockets-core` (`@bitwild/rockets-core`): **shared server infrastructure** — auth abstraction (`AuthAdapterInterface`, `AuthServerGuard`), CQRS handlers, declarative resources (`defineResource`, `defineModuleResource`, `buildAppRegistrationPlan`), root `repository` adapter + `userMetadata` config, Swagger registration (`SwaggerUiModule`), opt-in `accessControl` (registers `@concepta/nestjs-access-control` when configured, nothing otherwise), and the shared decorators/utils formerly in `@bitwild/rockets-common` (`AuthUser`, `InjectDynamicRepository`, `InjectCrudAdapter`, model interfaces, `SchemaEntityCompiler` contract, error-logging/entity-key utils — now `src/common/`). Also owns the **zod-first resource layer** at the `@bitwild/rockets-core/zod` subpath (`zodResource`/`zodSubResource`/`bindZodResources`, `f.*` field helpers, `rocketsFieldMeta`/`rocketsEntityMeta` registries, `defineZodUserMetadata`). Zod is the first-class schema layer of Rockets; `zod` + `nestjs-zod` are **optional peers** and the main entry stays zod-free, so non-zod consumers pay nothing. The zod layer is still ORM-free: entity generation is delegated to a `SchemaEntityCompiler` adapter. Imported by both server and auth.
- `packages/rockets-repository-typeorm` (`@bitwild/rockets-repository-typeorm`): TypeORM implementation of the dynamic repository contract — a **thin wrapper** whose main entry re-exports upstream `@concepta/nestjs-repository-typeorm` verbatim, so consumers depend on a single `@bitwild/*` package. The only code it owns is the zod layer's TypeORM `SchemaEntityCompiler` at the `@bitwild/rockets-repository-typeorm/zod` subpath (`typeOrmZodEntityCompiler`). Mirror the `/zod` compiler for other stores (`rockets-repository-firestore`, …).
- `packages/rockets-repository-firestore`: Firestore implementation of the dynamic repository contract.
- `packages/rockets-server` (`@bitwild/rockets`): external-auth integration layer. `MeController` + global guard opt-in. Use when users live in Firebase / Auth0 / another system.
- `packages/rockets-server-auth` (`@bitwild/rockets-auth`): complete built-in auth system (JWT, signup, login, recovery, otp, oauth, admin).
- `packages/rockets-adapter-firebase`: Firebase auth adapter implementing `AuthAdapterInterface`.
- `examples/sample-server`: canonical reference app using `rockets-server` with an external auth adapter. Wires the zod layer in one line (`src/zod-bindings.ts`: `bindZodResources(typeOrmZodEntityCompiler)`).
- `examples/sample-server-auth`: reference app using `rockets-server-auth` (built-in auth).
- `examples/sample-code-review`: full-stack reference (api + web) used for code review walkthroughs.
- `.context/`: shared scratchpad for multi-agent collaboration (gitignored).

## Rules Reference

Modular rules in `.claude/rules/`:

| Rule file | Scope | Purpose |
|---|---|---|
| `typescript-strict.md` | `**/*.ts` | No `any`, proper types, `readonly` |
| `build-test-lint.md` | always | Build/test/lint command order |
| `editing-guidelines.md` | always | Minimal diffs, source of truth |

## Testing Policy

- **E2E / integration tests are the default.** New tests must be `*.e2e-spec.ts`
  (real Nest app + supertest + SQLite) unless a unit test is specifically justified.
- Coverage target: **≥ 80% statements/lines** via `yarn test:e2e:cov`.
- Barrel imports (`domains/*/index`) register CQRS metadata globally; they must
  run **last** in the e2e suite (handled by `scripts/jest-e2e-barrel-last-sequencer.cjs`).
  Never import a barrel inside an e2e file that also boots a Nest app.
- See `.claude/rules/build-test-lint.md` for full details.

## Type Safety

- Never use `any`. Never use `as unknown as Type` or similar casts as a workaround.
- If you hit a type error, fix the type — don't suppress it.
