---
globs: "packages/*/src/**/*.ts,examples/*/src/**/*.ts"
description: Auth module integration invariants
---

# Auth Integration Invariants

- If app uses both modules, import order is required:
  1. `RocketsAuthModule`
  2. `RocketsModule`
- `RocketsModule` consumes an injected auth provider (commonly `RocketsJwtAuthProvider` from `rockets-server-auth`).
- Keep auth endpoint docs and generated swagger aligned when controllers change.
