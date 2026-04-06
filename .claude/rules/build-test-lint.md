---
description: Build, test, and lint commands for the project
---

# Build, Test, Lint

Run checks in this order after code changes:

1. `yarn build`
2. `yarn test`
3. `yarn test:e2e`
4. `yarn lint`

CI also runs: `yarn lint:all`, `yarn test:ci`

Coverage: `yarn test:e2e:cov` (uses `jest.config-e2e.coverage.json`).

# Testing Strategy

## Prefer E2E / Integration Tests

New tests **must** be `*.e2e-spec.ts` (integration / e2e) unless there is a
specific reason for a unit test. Integration tests that boot a real Nest app
with `supertest` are the primary way to verify behavior in this project.

- Use `Test.createTestingModule` + `app.init()` with SQLite for DB-backed flows.
- Reuse existing fixtures from `packages/rockets-server-auth/src/__fixtures__/`.
- Shared bootstrap helpers live in `packages/rockets-server-auth/src/__e2e__/helpers/`.

## Barrel / Index File Tests

Importing a barrel like `domains/user/index` registers all `@CommandHandler` /
`@QueryHandler` decorators in **global Reflect metadata**. This breaks later
Nest apps created in the same Jest process (`maxWorkers: 1`).

Rules for barrel tests:

1. Name the file descriptively (e.g. `rockets-auth-user-domain-barrel.e2e-spec.ts`).
2. The custom **`testSequencer`** at `scripts/jest-e2e-barrel-last-sequencer.cjs`
   guarantees it runs **after** all other e2e files. Both `jest.config-e2e.json`
   and `jest.config-e2e.coverage.json` reference it.
3. **Never** import a barrel inside an e2e file that also boots a Nest app.

## Test File Placement

| Kind | Naming | Location |
|------|--------|----------|
| E2E (preferred) | `*.e2e-spec.ts` | Co-located or in `__tests__/` next to the module |
| Unit (only when needed) | `*.spec.ts` | Co-located next to the source file |
| Fixtures | `*.fixture.ts` | `__fixtures__/` directories |

## Coverage Target

Statements / Lines ≥ **80 %** on `yarn test:e2e:cov`.
