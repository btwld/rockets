# AGENTS.md

Canonical agent instructions for this repository.

`CLAUDE.md` is intentionally a symlink to this file so different agents load the same project guidance.
Detailed rules live in `.claude/rules/` and are auto-loaded by Claude Code based on file globs.

## Start Here

1. Read `development-guides/ROCKETS_AI_INDEX.md` first.
2. Pick only the one guide needed for the task (avoid loading all guides).
3. Read `.context/handoff.md` for the latest local checkpoint before editing.
4. Keep `.context/notes.md` updated with findings for other parallel agents.

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