# @bitwild Self-Contained Migration — Session Summary

**Branch:** `feature/module-migration`
**Date:** 2026-06-04
**Status:** build GREEN · lint PASS · e2e 31/35 suites (248 tests) · NOT committed

---

## Goal

Turn the `@bitwild` repository / crud / app packages from **thin wrappers over
upstream `@concepta/nestjs-*`** into **self-contained source**, by adopting the
original concepta source packages (copied in as `*-concepta` folders) and
deleting the wrappers. Consolidate `rockets-common` into `rockets-app`.

## End-state package layout

```
app  ←  repository  ←  crud         (lowest → highest layer)
              ↑                ↖
        repository-typeorm      core ← server / server-auth
```

| Package | What it is now |
|---|---|
| `@bitwild/rockets-app` | **Foundation/kernel.** Context overlay (`AppContextHost`, `getAppContext`, `OverlayRef`, `Ctx`, `ContextOverlayInterceptor`), `RuntimeException`, hooks (`HookResolverService`, `Spec`), references, audit, `DomainAggregate`, `AuthUser`, SwaggerUi module, utils (`deriveEntityKey`/`resolveEntityKey`, `createRepositoryContext`, `whitelistedFromDto`, `stripUndefined`). **Replaced `rockets-common` (deleted).** Zero `@concepta/nestjs-*` deps. |
| `@bitwild/rockets-repository` | Self-contained dynamic repository (module, adapter, transactions, federation, hooks, query helpers). DB-agnostic. `@InjectDynamicRepository(string \| Type)`. |
| `@bitwild/rockets-repository-typeorm` | TypeORM implementation. |
| `@bitwild/rockets-crud` | Self-contained CRUD module + builder + CQRS handlers. `@InjectCrudAdapter(string \| Type)`. |

## What changed (the 5 phases)

- **Phase 0** — Recorded baseline: `@bitwild` ecosystem was green; the copied
  concepta packages had real TS compile errors.
- **Phase 1** — `rockets-app` became the self-contained superset of `common`.
  Ported 7 utils + `AuthUser` (5 lines) + a **fresh** SwaggerUi module +
  model interfaces. Renamed `@concepta/rockets-app` → `@bitwild/rockets-app`.
- **Phase 2** — Adopted repository: merged `InjectDynamicRepository` to
  `string | Type`, fixed `super.context` → `this.context` + `declare context`.
- **Phase 3** — Adopted crud + repository-typeorm: fixed the TypeORM `upsert`
  typing (normalize `DeepPartial` via `repo.create()` — no cast), fixed a
  union-narrowing bug that only fails under `strict:false` (distributive
  conditional structural view), merged `InjectCrudAdapter`, fixed fixture
  generic inference, aligned tsconfigs to exclude test files (project convention).
- **Phase 4** — Atomic cutover:
  - Deleted wrappers: `rockets-common`, old `rockets-repository`, old `rockets-crud`.
  - Renamed concepta folders/packages → `@bitwild/*`.
  - Swapped consumer imports: `rockets-common`→`rockets-app` (72 files);
    upstream `@concepta/nestjs-repository`/`-typeorm`/`-crud` → `@bitwild` (93 files);
    `@concepta/nestjs-common` kernel symbols split to app (52 files, 7 upstream-only
    symbols kept).
  - Rewired core `HookModule.forRoot({})` → `RocketsAppModule.forRoot()`.
  - This resolved the silent `AppContextHost`-identity bug (the #1 risk flagged up front).

## Why the `@bitwild` repository now DIVERGES from upstream (important)

The OLD `@bitwild/rockets-repository` was a wrapper that re-exported upstream
`@concepta/nestjs-repository`, so they shared the **same** `AppContextHost` /
`TransactionScope` classes. The NEW `@bitwild/rockets-repository` is independent
source — **different classes**. Anything that mixes the new `@bitwild` stack with
upstream `@concepta/nestjs-*` packages hits a cross-identity mismatch
("Expected AppContextHost, got object").

## The 4 failing e2e suites (both are documented boundaries, not bugs introduced)

1. **`rockets-crud`: `crud.operations`, `crud.adapter`** — PRE-EXISTING
   crud-internal test infra (dist-module `DataSource` DI wiring; ctx-overlay
   generics in the test helper). Never passed in this repo's baseline. Source is clean.

2. **`rockets-server-auth`: `me-password`, `password-history`** — ARCHITECTURAL
   BOUNDARY. server-auth composes `@bitwild` core (→ forces the `@bitwild`
   repository for its resource layer + global `SafeCrudContextInterceptor`)
   **and** upstream `@concepta/nestjs-invitation` / `nestjs-user` (→ need upstream
   `TransactionScope`). One app cannot provide both repository identities.
   This worked before only because the wrapper === upstream.

## OPEN DECISION for next session (server-auth)

Closing the server-auth boundary needs one of:
- **(A)** Migrate the upstream auth stack (`nestjs-invitation`, `nestjs-user`,
  `nestjs-otp`, `nestjs-role`, `nestjs-password`, `nestjs-federated`) to the
  `@bitwild` stack. Large, separate effort — makes server-auth fully self-contained.
- **(B)** Re-introduce a repository compat layer so `@bitwild` repository stays
  upstream-identity-compatible. Defeats the self-contained goal; also a "bridge"
  (forbidden by AGENTS.md rule #9).
- **(C)** Accept the 2 suites as a known boundary and ship the rest.

> You picked "keep auth on upstream" last session, but that is **structurally
> unachievable** while server-auth uses `@bitwild` core. Needs a real call between
> A / B / C.

## How to reproduce the current state

```bash
yarn install
yarn build          # GREEN
yarn lint           # PASS (4 warnings)
yarn test:e2e       # 31/35 suites, 248 tests pass; 4 fail (above)
```

## Notes / gotchas discovered

- Build is `tsc --build` (incremental) — it does NOT delete orphaned `dist`
  outputs. After renames, `rm -rf packages/*/dist *.tsbuildinfo` before a build,
  or stale `.js` files reference deleted packages at runtime.
- `tsconfig.jest.json` runs tests with `strict:false`; some adopted code had
  bugs that only surface there (union narrowing). Fixes must pass BOTH modes.
- Adding `reflect-metadata` as a dep to `rockets-app` made yarn nest a
  redundant `@nestjs/common` under `packages/rockets-app/node_modules`, which
  broke a portable-type emit (`TS2742`). Reverted; the spec's `import
  'reflect-metadata'` was redundant (it's a hoisted root dep).
- Upstream `@concepta/nestjs-user`/`invitation` peer-depend on
  `@concepta/nestjs-crud`/`-repository`; those deps were restored to package.json
  (source uses `@bitwild`, upstream auth packages keep their upstream peer).

## Detailed step-by-step log

See `.context/migration-baseline.md` (gitignored) for the full Phase 0→4 record
with exact files, errors, and fixes.
