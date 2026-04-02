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
