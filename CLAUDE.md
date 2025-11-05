# Rockets Server - Claude Code Context

> Project Context: @AGENTS.md

This file imports AGENTS.md to provide full project context to Claude Code.

## Team Guidelines

- Follow conventional commits (enforced by commitlint + husky)
- Run tests before committing: `yarn test` and `yarn test:e2e`
- Use workspace commands from root: `yarn build`, `yarn lint`, etc.
- Never bypass pre-commit hooks
- Update AGENTS.md when architectural changes occur

## Quality Gates

- All tests must pass (`yarn test:all`)
- No lint errors (`yarn lint:all`)
- TypeScript compilation must succeed (`yarn build`)
- Code coverage should be maintained (target: 80%)

## Development Notes

- This is a monorepo managed by Lerna + Yarn Workspaces
- Always run `yarn build` after pulling to compile TypeScript
- E2E tests use SQLite in-memory database
- API documentation is auto-generated via Swagger
