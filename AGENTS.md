# AGENTS.md

Canonical agent instructions for this repository.

`CLAUDE.md` is intentionally a symlink to this file so different agents load the same project guidance.
Detailed rules live in `.claude/rules/` and are auto-loaded by Claude Code based on file globs.

## Start Here

1. Read `development-guides/ROCKETS_AI_INDEX.md` first.
2. Pick only the one guide needed for the task (avoid loading all guides).

## Hard-Learned Rules (Read Before Editing)

These are lessons from corrections across many sessions. Violating them
repeats mistakes the user has already had to fix more than once.

1. **Layer discipline — core vs server.**
   `rockets-core` = shared infrastructure (auth abstraction, guard, CQRS,
   declarative resources, repository config, Swagger UI registration).
   `rockets` (server) = presentation + composition for external auth
   integration (`MeController`, `APP_GUARD` opt-in).
   Before placing a component, ask:
   *"Would `rockets-server-auth` also need this?"* Yes → core. No → server.
   **Controllers belong in server or auth, never in core. Swagger IS in
   core** (both server and auth need API docs from a single registration).

2. **Dynamic repository, not `@InjectRepository`.** In new code, use
   `@InjectDynamicRepository(KEY)` + `RepositoryInterface<Entity>` from
   `@bitwild/rockets-repository`. Register entities through bundles inside
   `resources[]` (`defineResource()` auto-contributes its entity row;
   `defineModuleResource({ entities: [...] })` contributes additional
   rows) plus `userMetadata.entity` for the metadata row — never via a
   module-local `TypeOrmModule.forFeature()`. The default adapter is the
   single top-level `repository: RepositoryModuleInterface` field.
   `rockets-server-auth` exposes **`defineRocketsAuth()`**, which contributes
   auth entity rows to the same `resources[]` / planner pipeline as core
   (see `@bitwild/rockets-auth` README). Do not register the same auth keys
   twice.

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
   `RepositoryInterface` and dynamic repository keys in `@bitwild/rockets-repository`.
   Concrete backends (TypeORM, Firestore, other adapters) are **selected in module
   options** and must remain **swappable**. `rockets-core` public design, types, and
   docs must not hard-require a specific ORM. Example configs may use TypeORM as
   a common case; that does not make TypeORM the definition of Rockets storage.

14. **Module resource exports are a public surface — export the minimum.**
    `defineModuleResource({ module: { providers, exports } })` materialises
    a Nest dynamic module that `RocketsCoreModule` re-exports globally
    (because core is `global: true`). That makes every entry in `exports`
    injectable from anywhere in the app — including the
    `inject: [...]` factory of `RocketsModule.forRootAsync`. Powerful,
    but also dangerous: two module resources exporting classes with the
    same name (`PriceFormatter`, `AuditService`, `Logger`) collide
    silently in the DI container — Nest accepts both, the last one
    wins, and the bug surfaces in production.

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

See `.claude/rules/rockets-core-architecture.md` for full details and
code examples.

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
- `.claude/rules/*.md` provide scoped, glob-filtered rules (TypeScript, DDD, auth, etc.).
- If a future subdirectory adds its own `AGENTS.md`, treat that as a scoped override for files in that subtree.
- When instructions conflict, prefer the most specific instruction file for the file path being edited.

## Repository Map

- `packages/rockets-common`: shared utils, hooks, swagger-ui re-export. Zero framework opinion.
- `packages/rockets-repository`: abstract dynamic repository API. No TypeORM, no Firestore.
- `packages/rockets-crud`: generic CRUD module + configurable builder.
- `packages/rockets-access-control`: ACL/RBAC primitives.
- `packages/rockets-core`: **shared server infrastructure** — auth abstraction (`AuthAdapterInterface`, `AuthServerGuard`), CQRS handlers, declarative resources (`defineResource`, `defineModuleResource`, `buildAppRegistrationPlan`), root `repository` adapter + `userMetadata` config, Swagger registration. Imported by both server and auth.
- `packages/rockets-server` (`@bitwild/rockets`): external-auth integration layer. `MeController` + global guard opt-in. Use when users live in Firebase / Auth0 / another system.
- `packages/rockets-server-auth`: complete built-in auth system (JWT, signup, login, recovery, otp, oauth, admin).
- `development-guides/`: implementation patterns and AI-oriented playbooks.
- `.context/`: shared scratchpad for multi-agent collaboration (gitignored).

## Rules Reference

Modular rules are in `.claude/rules/`:

| Rule file | Scope | Purpose |
|---|---|---|
| `typescript-strict.md` | `**/*.ts` | No `any`, proper types, `readonly` |
| `rockets-core-architecture.md` | `packages/rockets-{core,server,common,repository,crud,access-control}/**`, `examples/sample-server/**` | Core/server layer boundaries, dynamic repository, resource config, context overlay |
| `ddd-architecture.md` | `rockets-server-auth/src/**` | DDD layers, file placement, mandatory patterns |
| `upstream-delegation.md` | `rockets-server-auth/src/**` | Delegate to `@concepta/nestjs-*` v8 via CommandBus/QueryBus |
| `build-test-lint.md` | always | Build/test/lint command order |
| `auth-integration.md` | `packages/*/src/**` | Module import order, swagger alignment |
| `editing-guidelines.md` | always | Minimal diffs, source of truth |

## Testing Policy

- **E2E / integration tests are the default.** New tests must be `*.e2e-spec.ts`
  (real Nest app + supertest + SQLite) unless a unit test is specifically justified.
- Coverage target: **≥ 80 % statements/lines** via `yarn test:e2e:cov`.
- Barrel imports (`domains/*/index`) register CQRS metadata globally; they must
  run **last** in the e2e suite (handled by `scripts/jest-e2e-barrel-last-sequencer.cjs`).
  Never import a barrel inside an e2e file that also boots a Nest app.
- See `.claude/rules/build-test-lint.md` for full details.

## Guide Index (Use As Needed)

- **DDD architecture (read first for any structural work):** `packages/rockets-server-auth/DDD_REFERENCE.md`
- Setup/config: `development-guides/CONFIGURATION_GUIDE.md`
- Package choice and bootstrap: `development-guides/ROCKETS_PACKAGES_GUIDE.md`
- CRUD patterns: `development-guides/CRUD_PATTERNS_GUIDE.md`
- Auth deep dives: `development-guides/AUTHENTICATION_ADVANCED_GUIDE.md`
- Access control: `development-guides/ACCESS_CONTROL_GUIDE.md`
- Testing: `development-guides/TESTING_GUIDE.md`

Avoid casting like as unknown as DynamicModule[],
never do a work around to avoid a type error, always fix the type error.