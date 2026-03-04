# AGENTS.md

Canonical agent instructions for this repository.

`CLAUDE.md` is intentionally a symlink to this file so different agents load the same project guidance.

## Start Here

1. Read `development-guides/ROCKETS_AI_INDEX.md` first.
2. Pick only the one guide needed for the task (avoid loading all guides).
3. Read `.context/handoff.md` for the latest local checkpoint before editing.
4. Keep `.context/notes.md` updated with findings for other parallel agents.

## Scope & Precedence

- This root `AGENTS.md` is the default instruction set for the whole repository.
- If a future subdirectory adds its own `AGENTS.md`, treat that as a scoped override for files in that subtree.
- Keep broad policy here, and put package-specific rules close to package code when needed.
- When instructions conflict, prefer the most specific instruction file for the file path being edited.

## Repository Map

- `packages/rockets-server`: minimal auth-provider + `/me` metadata endpoints.
- `packages/rockets-server-auth`: complete auth system (token, signup, recovery, otp, oauth, admin).
- `development-guides/`: implementation patterns and AI-oriented playbooks.
- `.context/`: shared scratchpad for multi-agent collaboration (gitignored).

## Source of Truth Rules

- Behavior and API truth: `packages/*/src/**`.
- Public API surface for auth package: `packages/rockets-server-auth/swagger/swagger.json`.
- Guides and READMEs are helpful, but when docs conflict with code, prefer code.

## Build, Test, Lint

Run checks in this order after code changes:

1. `yarn build`
2. `yarn test`
3. `yarn test:e2e`
4. `yarn lint`

CI also runs:

- `yarn lint:all`
- `yarn test:ci`

## Auth Integration Invariants

- If app uses both modules, import order is required:
  1. `RocketsAuthModule`
  2. `RocketsModule`
- `RocketsModule` consumes an injected auth provider (commonly `RocketsJwtAuthProvider` from `rockets-server-auth`).
- Keep auth endpoint docs and generated swagger aligned when controllers change.

## Editing Guidelines

- Prefer minimal, scoped diffs.
- Do not refactor unrelated code in the same change.
- Keep naming and patterns consistent with nearby module code.
- If adding/changing endpoint behavior, update relevant docs and tests in the same change.

## Collaboration Files

- `.context/handoff.md`: auto-generated session snapshot (run `yarn handoff:update`).
- `.context/notes.md`: concise findings, caveats, and decisions.
- `.context/todos.md`: actionable follow-ups for parallel agents.

## Guide Index (Use As Needed)

- Setup/config: `development-guides/CONFIGURATION_GUIDE.md`
- Package choice and bootstrap: `development-guides/ROCKETS_PACKAGES_GUIDE.md`
- CRUD patterns: `development-guides/CRUD_PATTERNS_GUIDE.md`
- Auth deep dives: `development-guides/AUTHENTICATION_ADVANCED_GUIDE.md`
- Access control: `development-guides/ACCESS_CONTROL_GUIDE.md`
- Testing: `development-guides/TESTING_GUIDE.md`
