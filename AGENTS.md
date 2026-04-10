# AGENTS.md

Canonical agent instructions for this repository.

`CLAUDE.md` is intentionally a symlink to this file so different agents load the same project guidance.
Detailed rules live in `.claude/rules/` and are auto-loaded by Claude Code based on file globs.

## Start Here

1. Read `development-guides/ROCKETS_AI_INDEX.md` first.
2. Pick only the one guide needed for the task (avoid loading all guides).
3. Read `.context/handoff.md` for the latest local checkpoint before editing.
4. Keep `.context/notes.md` updated with findings for other parallel agents.

## Hard-Learned Rules (Read Before Editing)

These are lessons from corrections across many sessions. Violating them
repeats mistakes the user has already had to fix more than once.

1. **Layer discipline — core vs server.**
   `rockets-core` = shared infrastructure (auth, guard, CQRS, resources,
   context overlay). `rockets` (server) = presentation + composition
   (Swagger, `/me`, `APP_GUARD` opt-in). Before placing a component, ask:
   *"Would `rockets-server-auth` also need this?"* Yes → core. No → server.
   **Never put Swagger, controllers, or presentation concerns in core.**

2. **Dynamic repository, not `@InjectRepository`.** In new code, use
   `@InjectDynamicRepository(KEY)` + `RepositoryInterface<Entity>` from
   `@bitwild/rockets-repository`. Register entities in the root
   `repositoryPersistence` array — never in a module-local
   `TypeOrmModule.forFeature()`. This applies to `rockets-server-auth` AND
   `examples/sample-server`.

3. **Resource config is flat.** `RocketsResourceConfig` extends
   `CrudModuleForFeatureOptionsInterface` directly. No `crud.crud` nesting.
   Handlers declared in `operations[].queryHandler` / `commandHandler` are
   auto-extracted by core — do NOT duplicate them in `resource.providers`.

4. **`repositoryPersistence` is a root-level array, not per-resource.**
   All entities from all resources live in one place, grouped by adapter.

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

See `.claude/rules/rockets-core-architecture.md` for full details and
code examples.

## Scope & Precedence

- This root `AGENTS.md` is the default instruction set for the whole repository.
- `.claude/rules/*.md` provide scoped, glob-filtered rules (TypeScript, DDD, auth, etc.).
- If a future subdirectory adds its own `AGENTS.md`, treat that as a scoped override for files in that subtree.
- When instructions conflict, prefer the most specific instruction file for the file path being edited.

## Repository Map

- `packages/rockets-server`: minimal auth-provider + `/me` metadata endpoints.
- `packages/rockets-server-auth`: complete auth system (token, signup, recovery, otp, oauth, admin).
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

## Collaboration Files

- `.context/handoff.md`: auto-generated session snapshot (run `yarn handoff:update`).
- `.context/notes.md`: concise findings, caveats, and decisions.
- `.context/todos.md`: actionable follow-ups for parallel agents.

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