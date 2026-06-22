---
name: e2e-fixer
description: Diagnose and fix failing or flaky tests in this monorepo, with a bias for e2e (*.e2e-spec.ts). Use when tests fail after a change, when a suite passes alone but fails in the full run, on fixture/bootstrap drift, barrel-registration collisions, teardown/open-handle leaks, or missing jest matchers. Triggers on "fix the tests", "e2e failing", "flaky test", "tests pass alone but not together".
---

# E2E Fixer

E2E is the default test tier here (`*.e2e-spec.ts`, real Nest app + supertest + SQLite). Most "failures"
are environment/isolation, not logic — separate the two before editing source.

## First: is it mine, pre-existing, or flaky?

1. Run the failing suite **in isolation**: `corepack yarn jest --config jest.config-e2e.json "<suite-path>"`.
   Passes alone but fails in the full run → isolation/teardown flake, not a logic bug.
2. Establish a baseline with `git stash` (keep node_modules) and re-run the suite. Same failure on clean HEAD
   → pre-existing, not your regression. Say so explicitly; do not "fix" pre-existing breakage silently.
3. Filter ts-jest noise: pipe through `grep -vE "TS151002|ts-jest\[config\]"`.

## Known failure classes and fixes

- **Barrel registration collisions.** Importing a `domains/*/index` barrel registers `@CommandHandler`/
  `@QueryHandler` in global Reflect metadata and breaks later Nest apps in the same worker. Never import a barrel
  in an e2e file that boots an app. Barrel-only specs run **last** via `scripts/jest-e2e-barrel-last-sequencer.cjs`
  (wired in both `jest.config-e2e.json` and the coverage config).
- **Teardown / open handles.** "force exiting Jest" / "worker failed to exit" + `Parse Error: Expected HTTP/`
  from supertest = a prior app wasn't closed. Ensure `await app.close()` in `afterEach`/`afterAll`; for
  cross-suite flakiness use per-file isolation (`scripts/run-isolated-e2e.cjs`, as sample-server does).
- **Fixture drift (v7→v8).** Symptoms: 500s, `Class extends value undefined`, `x is not a function`. Fix the
  fixture to the v8 pattern — `RepositoryModule.forFeature` for every entity, no duplicate `TypeOrmModule.forRoot`,
  correct `extras` (user/otp/role/federated/invitation). Reuse `packages/rockets-server-auth/src/__fixtures__/`
  and `__e2e__/helpers/`.
- **Missing matchers.** `toBeArrayOfSize is not a function` → `jest-extended` not wired. Add
  `"setupFilesAfterEnv": ["jest-extended/all"]` to the jest config (it was a real gap, not a bug).
- **Module-resolution after a bump.** `Cannot find module '@concepta/.../subpath'` in jest → see **upstream-migrator**:
  fix `tsconfig.jest.json` (`isolatedModules` + `module: commonjs`) and `moduleNameMapper`.

## Rules

- New tests must be `*.e2e-spec.ts` unless a unit test is specifically justified. Coverage target ≥ 80% via `yarn test:e2e:cov`.
- Fix the test setup or the real bug — never weaken an assertion or add `any` to make red go green.
- Report the final tally honestly (passed/failed/skipped) and label each remaining failure as fixed, pre-existing, or flaky.
