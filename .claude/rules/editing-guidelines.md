---
description: Code editing best practices for this repository
---

# Editing Guidelines

- Prefer minimal, scoped diffs.
- Do not refactor unrelated code in the same change.
- Keep naming and patterns consistent with nearby module code.
- If adding/changing endpoint behavior, update relevant docs and tests in the same change.

# Source of Truth

- Behavior and API truth: `packages/*/src/**`
- Public API surface for auth package: `packages/rockets-server-auth/swagger/swagger.json`
- When docs conflict with code, prefer code.
