# AGENTS.md

Canonical agent instructions for this repository.

`CLAUDE.md` is intentionally a symlink to this file so different agents load
the same project guidance.
Additional scoped rules live in `.claude/rules/`.

## Start Here

1. Read this file end-to-end before editing.
2. Open the `README.md` of the package you are about to change.
3. If anything in this file conflicts with the actual code in
   `packages/*/src/`, **the code wins** — and fix this file in the same PR.

## Hard-Learned Rules (Read Before Editing)

These are lessons from repeated corrections. Violating them repeats mistakes
the user has already had to fix more than once.

1. **Layer discipline — core vs server.**
   `rockets-core` = shared infrastructure (auth abstraction, guard, CQRS,
   declarative resources, repository config, Swagger UI registration).
   `rockets` (server) = presentation + composition for external auth
   integration (`buildMeController`, `APP_GUARD` opt-in).
   Before placing a component, ask:
   *"Would `rockets-server-auth` also need this?"* Yes → core. No → server.
   **Controllers belong in server or auth, never in core. Swagger IS in
   core** (both server and auth need API docs from a single registration).
   Access control is core too: the opt-in `accessControl` option on
   `RocketsCoreModule` / `RocketsModule` registers upstream
   `@concepta/nestjs-access-control`; when omitted, no ACL wiring exists.

2. **Dynamic repository, not `@InjectRepository`.** In new code, use
   `@InjectDynamicRepository(KEY)` + `RepositoryInterface<Entity>`. **Features
   built on top of core import these from `@concepta/rockets-core`** (it
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
   plus a `userMetadata` config (`entity` + named `updateSchema` /
   `responseSchema`, optional per-entity `repository` override — what
   `defineZodUserMetadata` returns). All other persistence rows are contributed by
   bundles inside `resources[]`:
   - `defineResource()` — CRUD-shaped, auto-contributes its entity row.
   - `defineSubResource()` — nested CRUD under a parent path param.
   - `operationResource()` / `defineOperationResource()` — typed non-CRUD
     HTTP endpoints (generated controller; no entity row). Prefer the
     zod helper from `@concepta/rockets-core/zod`.
   - `defineModuleResource({ entities, module })` — non-CRUD persistence
     and/or Nest module slice (controllers/providers/exports/imports).
     Per-entity `repository` overrides the root adapter for that one
     table; bundles with `entities: []` are valid and useful for
     CQRS-only workflows without generated HTTP.
   There is **no** `repositories.entities[]` block any more — registering
   the same entity in two places (or splitting key + class across files)
   is what this rule prevents.

5. **Never lose definition imports in a `definitionTransform`.** Always
   preserve the imports already present on the generated definition before
   appending package-owned imports. Otherwise async factory dependencies can
   become invisible to Nest. Check this every time a module-definition file
   is edited.

6. **Every wire shape is a named zod schema.** Request bodies and
   responses — generated CRUD, `operationResource`, `/me`, hand-written
   controllers, `rockets-server-auth` — are zod schemas wrapped **last**
   with `withOpenApi(schema, 'ComponentName')` (re-exported from
   `@concepta/rockets-core`): the id is the OpenAPI component name, the
   bridge is what documents it. There are no DTO classes, no
   `@ApiProperty()`, no class-validator / class-transformer. A call
   chained after the wrap (`.extend()`, `.strict()`, `.optional()`,
   `.pick()`, `.array()`) returns a clone without the id —
   `assertNamedSchema` rejects it at boot. Never `withNamedComponent`
   (module-global registry; throws on the second registration).
   Hand-written routes: class-level
   `@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))`,
   `@Body({ schema })` typed `z.output<typeof schema>` (never a class),
   `@ApiResponse({ standardSchema })`; a response serialized by schema
   adds `@SerializeOptions({ schema })` + `StandardSchemaSerializerInterceptor`.
   Never register a **global** `StandardSchemaValidationPipe` — every
   Rockets route carries its own, and core rejects a global one at boot.
   The reverse is checked too: a `{ schema }` parameter that no
   `StandardSchemaValidationPipe` reaches (Nest installs none for
   `schema`) fails the boot as `requireSchemaPipe`.

7. **Verify compilation after edits.** Do not declare done based on IDE
   green state alone. Run `yarn build` and the relevant type/test command;
   boot the applicable sample when runtime wiring changed. Missing imports
   and wrong-package auto-imports are caught by the real toolchain, not by
   editor confidence.

8. **Do not trust IDE auto-imports.** `withNamedComponent` from
   `@concepta/nestjs-core` is NOT `withOpenApi` (it registers the id in a
   module-global map and throws the second time). Verify the imported
   symbol actually does what you intend.

9. **No undocumented workarounds.** Bridge modules, lazy placeholders,
   fake providers, and unchecked assertions must not conceal a design or
   wiring problem. A production compatibility/variance assertion is allowed
   only at a boundary TypeScript cannot express, when runtime identity makes
   it safe and an adjacent comment states that invariant. If the invariant
   cannot be demonstrated, stop and ask.

10. **No unused fields in interfaces.** If a field is not actively consumed,
    remove it.

11. **Do not assume the user is right.** When asked to analyze, do
    independent analysis and push back if the premise is wrong.

12. **READ before editing.** Open the file, understand the surrounding
    code, THEN modify. Do not edit blindly based on a diff alone.

13. **Persistence is database-agnostic by default.** The supported contract is
    `RepositoryInterface` and dynamic repository keys in `@concepta/nestjs-repository`
    (re-exported by `@concepta/rockets-core`). Concrete backends (TypeORM,
    Firestore, other adapters) are **selected in module options** and must
    remain **swappable**. `rockets-core` public design, types, and docs must
    not hard-require a specific ORM — the zod layer stays ORM-free by
    delegating entity generation to a `SchemaEntityCompiler` adapter. Example
    configs may use TypeORM as a common case; that does not make TypeORM the
    definition of Rockets storage.

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

15. **Zod-first resources — review checklist.**
    - Schema is source of truth; use `f.*` helpers, not raw `.register` unless
      necessary.
    - Relations: `f.fk()` / `f.hasMany(childSchema)` — reject
      `z.array(z.unknown())`.
    - Types: `WireRow<S>` for API (JSON-encoded: `Date` → ISO string);
      `SchemaPersistenceRow<S>` (`z.output<S>`, `Date` columns) for
      hooks/repos — not the entity class.
    - Dates: `f.createdAt()` / `f.updatedAt()` / `f.deletedAt()` are
      `z.date()`; a writable datetime is `f.date()` (`z.coerce.date()`).
      A response-exposed `z.iso.datetime()` fails at definition time —
      rows carry `Date` objects and the response schema validates them.
    - Response schemas fail closed: `.passthrough()` / `.catchall()`
      anywhere in a response is rejected; `f.compute()` returns
      `z.output<schema>` and is validated at serialization.
    - Component ids are the old DTO names (`${Name}ResponseDto`,
      `${Name}CreateDto`, `${Name}ResponseDtoPaginatedDto`, …); the
      Swagger document `$ref`s them through `SwaggerUiService.createDocument`.
    - Compile entity in `*.schema.ts` only to break import cycles; default is
      `zodResource({ schema })`.
    - Persistence hints belong in `rocketsFieldMeta` / `rocketsEntityMeta`;
      API docs belong in `.meta()` — never put `db` in `.meta()`.
    - Unsupported column types need `db.column`; many-to-many is a junction
      sub-resource.
    - Capability matrix: `packages/rockets-core/README.md` (Zod-first
      section).
    - Typed non-CRUD HTTP: `operationResource` with callback
      `operations(op)` (`op.read` / `op.write` / `op.delete`); **`output`
      required** (schema or `false`); path defaults to the key; optional
      resource `params` for path validation. See `CONFIGURATION.md` §6a.

16. **Every repository call forwards `ctx`.** A call that omits it runs
    with **all entity hooks disabled** and **outside the surrounding
    operation's transaction**. Neither is a type error and neither shows
    up in a passing test — this is the defect class behind issue #45,
    where a guard's parent lookup ran hook-free for a whole development
    cycle behind a green suite. Take the context from where you are: a
    hook's second argument, the CRUD context a CQRS handler receives, or
    the scope you opened with `TransactionScope.run` — which **starts no
    transaction by itself**. The outermost `run()` installs a
    `TransactionManager` on `txCtx` and owns commit/rollback; a *nested*
    `run()` joins the outer manager, committing nothing and ignoring its
    own `timeout` — but a nested `readOnly` that CONTRADICTS the scope it
    joined throws `TransactionReadOnlyConflictException` and aborts the
    outer scope. The adapter starts the real transaction lazily, on the
    first repository call that forwards `txCtx`. There is **no
    `propagation` option** (upstream `8.0.0-alpha.10` removed it, and
    `TransactionRequiredException` with it): `run()` always fails OPEN, so
    a scope with no transaction factory registered for the store you are
    writing runs unprotected and nothing warns. `transactional: true`
    exists only on CRUD and operation-resource operations; anything else
    opens its own scope. One exception: an `op.sse()` operation REJECTS
    `Transactional()` at definition time (on the operation or on the
    resource) — the handler returns its Observable immediately, so the
    transaction would commit before any event is emitted. Open one
    inside the stream instead. Full seam with examples:
    `CONFIGURATION.md` §8a; SSE specifics in §6c.

## How to work with the project owner

When replying to the project owner or maintainer:

- Prefer **short, direct answers** and **code** when it clarifies behavior; avoid
  filler and over-long essays.
- Treat this codebase as **high quality bar**: designs should remain valid if the
  **repository adapter** (or database) is swapped, not only under one ORM.
- This section encodes their preferences for assistants; it is not a technical
  dependency of the build.

## Scope & Precedence

- This root `AGENTS.md` is the default instruction set for the whole
  repository.
- `.claude/rules/*.md` provide scoped, glob-filtered rules (TypeScript,
  build/test/lint, editing).
- If a future subdirectory adds its own `AGENTS.md`, treat that as a scoped
  override for files in that subtree.
- When instructions conflict, prefer the most specific instruction file for
  the file path being edited.

## Repository Map

The engine is the upstream `@concepta/nestjs-*` stack consumed from npm
(`nestjs-core`, `nestjs-repository`, `nestjs-crud`, `nestjs-authentication`,
`nestjs-access-control`, plus the identity modules used by server-auth).
The Rockets `@concepta/*` packages are composition + curated re-exports on top
of it.

- `packages/rockets-core` (`@concepta/rockets-core`): **shared server
  infrastructure** — auth abstraction (`AuthAdapterInterface`,
  `AuthServerGuard`), CQRS handlers, declarative resources (`defineResource`,
  `defineModuleResource`, `defineSubResource`, `defineOperationResource`,
  `buildAppRegistrationPlan`), root `repository` adapter + `userMetadata`
  config, Swagger registration (`SwaggerUiModule`), opt-in `accessControl`
  (registers `@concepta/nestjs-access-control` when configured, nothing
  otherwise), and the shared decorators/utils formerly published in
  `@bitwild/rockets-common` (`AuthUser`, `InjectDynamicRepository`,
  `InjectCrudAdapter`, model interfaces, `SchemaEntityCompiler` contract,
  error-logging/entity-key utils — now `src/common/`). Also owns the
  **zod-first resource layer** at the `@concepta/rockets-core/zod` subpath
  (`zodResource`/`zodSubResource`/`operationResource`/`bindZodResources`,
  `f.*` field helpers, `rocketsFieldMeta`/`rocketsEntityMeta` registries,
  `defineZodUserMetadata`). Zod is THE schema layer of Rockets: `zod` is a
  dependency of the main entry, every resource's request/response contract
  is a named zod schema, and one engine — Nest 12's native Standard Schema
  pipe per route, upstream's schema serializer for CRUD responses, the
  schema's own JSON Schema bridge for OpenAPI — serves generated CRUD,
  `operationResource`, `/me` and hand-written controllers alike. The zod
  layer is still ORM-free: entity generation is delegated to a
  `SchemaEntityCompiler` adapter.
  Imported by both server and auth.
- `packages/rockets-repository-typeorm`
  (`@concepta/rockets-repository-typeorm`): TypeORM implementation of the
  dynamic repository contract — a **thin wrapper** whose main entry
  re-exports upstream `@concepta/nestjs-repository-typeorm` verbatim, so
  consumers depend on a single Rockets package. The only code it owns is the
  zod layer's TypeORM `SchemaEntityCompiler` at the
  `@concepta/rockets-repository-typeorm/zod` subpath
  (`typeOrmZodEntityCompiler`). Mirror the `/zod` compiler for other stores
  (`rockets-repository-firestore`, …).
- `packages/rockets-repository-firestore`
  (`@concepta/rockets-repository-firestore`): Firestore implementation of the
  dynamic repository contract.
- `packages/rockets-server` (`@concepta/rockets`): external-auth integration
  layer and curated core facade. `MeController` + global guard opt-in. Use when
  users live in Firebase / Auth0 / another external system.
- `packages/rockets-server-auth` (`@concepta/rockets-auth`): complete built-in
  auth system (JWT, signup, login, recovery, OTP, OAuth, admin). Compose it
  with core or server; it does not mirror the server facade.
- `packages/rockets-adapter-firebase`
  (`@concepta/rockets-adapter-firebase`): Firebase auth adapter implementing
  `AuthAdapterInterface`.
- `examples/sample-server`: canonical reference app using `rockets-server`
  with an external auth adapter. Wires the zod layer in one line
  (`src/zod-bindings.ts`: `bindZodResources(typeOrmZodEntityCompiler)`).
- `examples/sample-server-auth`: reference app using `rockets-server-auth`
  (built-in auth).
- `examples/sample-code-review`: full-stack reference (API + web) used for
  code review walkthroughs.
- `scripts/`: checked release, package-contract, repository-integrity, and
  integration helpers. Prefer the existing Vitest project/pool configuration
  over custom test-runner plumbing.
- `api/public-api-reports.json`: reviewed declaration-level contract for every
  published TypeScript entry point, alongside `api/public-api-policy.md`. Run
  `yarn api:report` after public export or signature changes; update it only
  after reviewing the compatibility impact and documentation or migration note.
- `.context/`: shared scratchpad for multi-agent collaboration (gitignored).

## Rules Reference

Modular rules in `.claude/rules/`:

| Rule file | Scope | Purpose |
|---|---|---|
| `typescript-strict.md` | `**/*.ts` | Strict types and documented boundary exceptions |
| `build-test-lint.md` | always | Build/test/lint command order |
| `editing-guidelines.md` | always | Minimal diffs, source of truth |

## Testing Policy

- **E2E / integration tests are the default.** New tests should be
  `*.e2e-spec.ts` (real Nest app + supertest + SQLite) unless a focused unit
  test is the more direct behavior boundary.
- The enforced unit coverage gate (`yarn test:ci` / `yarn test:cov`) is
  statements **50%**, branches **50%**, functions **40%**, and lines **50%**.
  `yarn test:e2e:cov` produces the package-E2E coverage report without a
  threshold gate.
- Importing a handler barrel evaluates its decorated CQRS classes and attaches
  metadata to those class objects. Avoid unrelated domain-barrel imports in an
  E2E file that boots a Nest app; Vitest's fork pool isolates spec files.
- See `.claude/rules/build-test-lint.md` for full details.

## Type Safety

- Prefer precise types and `unknown` plus narrowing at untrusted boundaries.
- Do not introduce `any` except to mirror a documented upstream contract; keep
  the exception local, commented, and lint-scoped.
- Do not use assertions to silence a real mismatch. A narrow production
  compatibility/variance assertion must preserve runtime identity and carry an
  adjacent invariant comment. Tests and fixtures may assert controlled mock
  shapes, but must not use casts to bypass the behavior under test.
