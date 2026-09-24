# Contributing to Rockets

Thanks for taking the time to contribute. This document covers what you
need to get a change merged.

## Before you start

- **Bug or feature?** Open an issue first using one of the
  [templates](https://github.com/btwld/rockets/issues/new/choose). For a
  design question or an idea that is not yet a proposal, use
  [Discussions](https://github.com/btwld/rockets/discussions).
- **Security issue?** Do **not** open a public issue — see
  [SECURITY.md](SECURITY.md).

## Development setup

Node 22 and Yarn 4 (via Corepack):

```bash
corepack enable
corepack yarn install
corepack yarn build
```

## The checks your PR must pass

Run these locally before pushing; CI runs the same set:

```bash
yarn build            # TypeScript project references
yarn typecheck:spec   # type-checks test files (the runner only transpiles)
yarn lint:all         # eslint + markdownlint
yarn test             # unit tests
yarn test:e2e         # package e2e tests
```

Example apps have their own e2e suites:

```bash
corepack yarn workspace sample-server test:e2e
corepack yarn workspace sample-server-auth test:e2e
corepack yarn workspace api test:e2e            # sample-code-review
```

If the full e2e run fails intermittently on a machine under memory
pressure, that is a known host-level effect, not a code defect — see the
"Intermittent e2e failures" entry in [CHANGELOG.md](CHANGELOG.md). Lower
the worker count (`--maxWorkers=2`) rather than retrying.

## Code standards

These are enforced in review, and most are enforced by lint:

- **No `any`.** Use `unknown` and narrow it, or define an interface.
- **No casts as workarounds** — no `as Type` to silence a real type
  error, no `@ts-ignore`, no `eslint-disable` to pass a gate.
- **Prefer deleting code over adding it.** Dead code, unused options and
  stale comments are defects.
- **Comment WHY, not WHAT.** A comment earns its place when the reason
  is non-obvious.
- **Match the surrounding module.** Naming, structure and idiom should
  be indistinguishable from neighbouring code.

## Tests

Integration/e2e is the default tier: new tests are `*.e2e-spec.ts`
booting a real Nest app with `supertest` and SQLite, unless a unit test
is specifically justified. Assert behaviour over HTTP, not internal
metadata that the code under test sets itself.

Test files are type-checked (`yarn typecheck:spec`) — they are held to
the same standards as source.

## Commits and pull requests

- Follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `docs:`, `test:`, `chore:`, with `!` or a
  `BREAKING CHANGE:` footer for breaking changes.
- Explain **why** in the body, not just what. If you rejected an
  alternative approach, say so.
- Keep the PR scoped. Unrelated refactors belong in their own PR.
- Update `CHANGELOG.md` under `Unreleased` for anything a consumer would
  notice, and document breaking changes with the migration step.

## Project layout

| Path | What it is |
|---|---|
| `packages/rockets-core` | Planner and wiring layer; auth contract, resource planner, hooks |
| `packages/rockets-server` | External-auth server (`/me`, global guard) |
| `packages/rockets-server-auth` | Full built-in auth system (signup, login, OTP, admin) |
| `packages/rockets-repository-*` | Persistence adapters (TypeORM, Firestore) |
| `packages/rockets-storage` | Provider-neutral object storage and named Nest stores |
| `packages/rockets-adapter-firebase` | Firebase auth adapter |
| `examples/*` | Runnable sample apps, exercised by e2e |

## Releasing

The seven public packages are released in lockstep: every release moves all
of them to the same version, whether or not a package changed.

**1. Bump versions.** While the line is on `0.x` alphas, set the `version`
field of every `packages/*/package.json` to the next prerelease
(`0.1.0-alpha.3` → `0.1.0-alpha.4`) and add a matching section to the root
`CHANGELOG.md` and to each package `CHANGELOG.md`. A package with no change
gets a one-line "released in lockstep" entry. Update the version the READMEs,
guides and `SECURITY.md` name in the same commit.

`yarn version:alpha` and `yarn version:stable` applied the retained
`.yarn/versions/alpha.yml` plan, which was removed when the line restarted at
`0.1.0-alpha.1`; today they change nothing. The stable helpers below are for
after the line leaves alpha:

| Command | Example result |
|---|---|
| `yarn version:patch` | `1.0.0` → `1.0.1` |
| `yarn version:minor` | `1.0.0` → `1.1.0` |
| `yarn version:major` | `1.0.0` → `2.0.0` |

**2. Verify before publishing:**

```bash
yarn release:check   # build + packed consumer + types + lint + tests + samples
yarn release:audit   # fails on high-severity advisories
yarn release:dry     # lists exactly what each tarball will contain
```

`release:check` includes the Firestore emulator suite, which needs JDK 21+.
Without it, run the rest with `SKIP_EMULATOR=1`; the `release-readiness`
workflow runs the emulator suite on every pull request, so open the release
PR before publishing.

Read the `release:dry` output: each tarball must carry `dist/`,
`README.md`, `LICENSE.txt` and `CHANGELOG.md`, and must NOT carry `src/`,
`*.spec.*` or `docs/`. Cross-package dependencies are published as real
version ranges: Yarn resolves the `workspace:^` protocol at pack time, so a
packed `package.json` carries `^0.1.0-alpha.3`, never `workspace:`.

**3. Publish** to the matching dist-tag. Yarn does not read `npm login`;
give it a granular npm access token with publish rights on the `@concepta`
scope through the environment, never in a committed file:

```bash
export YARN_NPM_PUBLISH_REGISTRY=https://registry.npmjs.org
export YARN_NPM_AUTH_TOKEN=<token>
yarn publish:alpha    # or publish:beta / publish:latest
```

Each publish helper re-runs `release:check`, does a clean build, checks the
aligned manifest version immediately before the registry write, then
publishes in topological order so dependencies go out before dependents.
Alpha and beta versions must match their prerelease dist-tag;
`publish:latest` accepts only stable versions.

Until 1.0, `latest` also points at the newest alpha, so a plain
`npm install @concepta/rockets` does not resolve the unsupported
`0.0.1-dev.0`. Move it after each alpha publish (this uses the npm CLI, so
it needs `npm login` or the same token in `~/.npmrc`):

```bash
for p in rockets-core rockets rockets-auth rockets-repository-typeorm \
         rockets-repository-firestore rockets-adapter-firebase rockets-storage; do
  npm dist-tag add @concepta/$p@<version> latest
done
```

**4. Confirm:**

```bash
npm view @concepta/rockets
npm dist-tag ls @concepta/rockets
```

## Naming

The npm scope is `@concepta` — the same scope as the upstream
`@concepta/nestjs-*` packages this project composes. Rockets packages are
distinguished by their name (`@concepta/rockets-core`,
`@concepta/rockets-auth`, …), not by a separate scope.

The GitHub organization is `conceptadev`, so package metadata
(`repository`, `homepage`, `bugs`) points at
`github.com/btwld/rockets`.

## License

By contributing, you agree that your contributions are licensed under
the [BSD-3-Clause License](LICENSE.txt) that covers this project.
