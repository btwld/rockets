---
name: upstream-migrator
description: Migrate the monorepo across @concepta/* and @nestjs/* version bumps and local↔npm dependency swaps. Use when asked to "bump @concepta to alpha.X", "use the npm packages instead of local", "upgrade NestJS", or when a version change breaks the build with module-resolution, exports-map, common→core, or exception-identity errors. Handles the recurring traps that classic version bumps hide.
---

# Upstream Migrator

Bumping `@concepta/*` / `@nestjs/*` in this repo is rarely a clean version flip — upstream
restructures packages between alphas. Work through this checklist; do not assume a bump is mechanical.

## 1. Establish the real target before editing

- For each package the user lists, run `npm view <pkg>@<version> dependencies peerDependencies version`.
- Build the dependency graph: note which `@concepta/*` packages the new version **drops** or **renames**
  (historically `nestjs-common` → `nestjs-core`; `email`/`event`/`swagger-ui`/`typeorm-ext` had no 8.x).
- Check what the repo's source actually imports from the dropped packages:
  `grep -rl "@concepta/nestjs-common" packages/*/src`. Those are your migration sites.

## 2. Apply versions deterministically

- Update root `package.json` `resolutions` **and** each package's dep entry. A small node script keyed by
  package name beats N hand edits and avoids touching packages that have no new version.
- To use npm instead of a local workspace copy: keep the folder on disk, exclude it from `workspaces`
  with a `!packages/<name>` negation (Yarn Berry) so the npm version resolves.
- Install with `corepack yarn install` (the repo is Yarn Berry 4.x; global `yarn` is v1 and will choke on the lockfile).

## 3. The traps that a bump hides (check every time)

- **moduleResolution.** New `@concepta/*` expose types only via `package.json` `exports` subpaths
  (e.g. `@concepta/nestjs-core/aggregate`). Classic `node` resolution ignores `exports`, so types silently
  degrade and `skipLibCheck` masks it. The repo uses `module/moduleResolution: nodenext` for this reason —
  keep it. Probe with a throwaway import + `tsc --noEmit`.
- **common → core.** Re-point moved symbols (`DomainAggregate` from `…/aggregate`, `ActionEnum`,
  `RuntimeException`, references, audit) to `@concepta/nestjs-core`. Removed re-exports (e.g. `AccessControlAction`) get deleted, not faked.
- **Exception identity.** Concepta exceptions extend `@concepta/nestjs-core`'s `RuntimeException`, which is a
  *different class* from `@bitwild/rockets-app`'s. Any `instanceof RuntimeException` / global filter that
  imported from `@concepta/nestjs-common` must switch to `@concepta/nestjs-core`, or concepta errors become 500s.
- **Config shapes.** Option interfaces change (e.g. role `assignments` requiring a flat `entityKey`). Read the
  installed `.d.ts` in `node_modules/<pkg>/dist`, not upstream `src` at HEAD.

## 4. Jest layer (separate from the build)

- ts-jest under nodenext needs `isolatedModules: true` + `module: commonjs` in `tsconfig.jest.json`
  (decouples test transpile from the build; downlevels dynamic `import()` so jest's CJS VM runs it).
- Mirror every `exports`-subpath mapping in **both** `tsconfig.jest.json` `paths` **and** jest `moduleNameMapper`
  (and the per-package `jest.config*.json`), pointing at the real `dist` file.

## 5. Verify

- `tsc --build --force` must be **0 errors** (force, to defeat stale `.tsbuildinfo`).
- Boot `sample-server` and `sample-server-auth` (ts-node) and exercise signup/login — DI/exception identity
  only fails at runtime.
- Run `yarn test`; distinguish pre-existing failures from regressions with a `git stash` baseline before claiming a break is yours.
- No `any`/casts to paper over a shape change — fix the type or ask.
