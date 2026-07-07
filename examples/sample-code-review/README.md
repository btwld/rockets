# sample-code-review

[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Full-stack reference: NestJS API + Vite/React web. External auth via Firebase, two persistence adapters (SQLite + Firestore) in the same app, an LLM-driven code-review feature backed by the GitHub API.

---

## 1. Introduction

`sample-code-review` is the "non-trivial app" reference. While `sample-server` and `sample-server-auth` are focused single-concern demos, this one exercises Rockets under real-world conditions:

- Two-adapter auth chain (Firebase ID token first, server-to-server API key second).
- Two persistence backends in one app: SQLite for OAuth tokens / user metadata, Firestore for code-review reports.
- A non-CRUD `defineModuleResource` feature (`analysisFeature`) that calls OpenAI and writes reports through the dynamic-repository contract.
- A separate React frontend that authenticates with Firebase client SDK and forwards the ID token to the API.

The layout intentionally mirrors [`rockets-starter`](https://github.com/btwld/rockets-starter) (`apps/api` + `apps/web`). In this monorepo every `@bitwild/*` import resolves to local `packages/*` via `workspace:^` — live integration test for in-development SDK changes. Published packages: `1.0.0-alpha.9` on npm (`@alpha` dist-tag).

```
rockets/                           (SDK monorepo, source of truth)
├── packages/rockets-{core,server,…}
└── examples/sample-code-review/
    ├── apps/
    │   ├── api/                   NestJS + Rockets         :3001
    │   └── web/                   Vite + React             :3000
    └── packages/typescript-config (shared tsconfig)
```

### Auth flow

```
Web (Firebase client SDK)               API (@bitwild/rockets)
───────────────────────────             ───────────────────────────
1. email/password login          →      (no participation)
2. user.getIdToken()             →      Authorization: Bearer <Firebase JWT>
                                  →     AuthServerGuard (global)
                                  →     FirebaseAuthAdapter.authenticate()
                                  →     request.user = AuthorizedUser
                                  →     GET /me, /github/*, /analysis/*
```

Firebase is **not** the application backend — it only issues the ID token. The Rockets server validates that token on every request.

| Layer | Responsibility |
|---|---|
| Firebase (client) | Web login; `user.getIdToken()` |
| `@bitwild/rockets-adapter-firebase` | Verifies ID token via Firebase Admin SDK |
| `@bitwild/rockets` | Global `AuthServerGuard` + `MeController` + protected routes |
| Your controllers | `@AuthUser()`, `@Ctx()` — user already authenticated |

A second adapter, `defineApiKeyAuth()`, runs after Firebase in the chain so server-to-server callers can authenticate with `X-Api-Key`.

---

## 2. Get Started

### Prerequisites

- Node 18+, Yarn 4.
- A Firebase project for real auth (or `FIREBASE_USE_FAKE=true` for in-process verification).
- A GitHub OAuth App if you want the GitHub connect flow to work.
- An OpenAI API key if you want real code-review output (otherwise the analyzer falls back to a stub).

### Install (from the monorepo root)

```bash
yarn install
yarn build
```

The `build` step compiles every local `@bitwild/*` package — required before the example runs.

### Configure

```bash
cp examples/sample-code-review/apps/api/.env.example examples/sample-code-review/apps/api/.env
cp examples/sample-code-review/apps/web/.env.example examples/sample-code-review/apps/web/.env
```

For local-only dev with no external services, set in `apps/api/.env`:

```env
FIREBASE_USE_FAKE=true
```

E2E tests inject an in-memory Firestore backend via a Jest stub (`test/stubs/code-review-reports.persistence.stub.ts`), not an env flag.

For real Firebase, drop the service-account JSON at `apps/api/secrets/firebase-service-account.json` and set `FIREBASE_PROJECT_ID` to match the web client's `VITE_FIREBASE_PROJECT_ID`.

### Run

```bash
yarn workspace sample-code-review dev
# web: http://localhost:3000
# api: http://localhost:3001
# swagger: http://localhost:3001/api
```

`yarn dev` starts both apps in parallel via `concurrently`. Use `yarn dev:api` / `yarn dev:web` to run them separately.

### E2E

```bash
yarn workspace sample-code-review test:e2e
# (runs API e2e with fakes enabled by default)
```

---

## 3. How-to Guides

### Run the full flow end-to-end

1. Sign in with Firebase on the web (`/login`).
2. Connect GitHub (`/github/connect` → callback `http://localhost:3000/auth/github/callback`). The callback URL must match `GITHUB_OAUTH_CALLBACK_URL` in the API `.env`.
3. Pick a repo, click "Run code review". The API calls the GitHub REST API for the file tree, slices it into prompts, calls OpenAI (`gpt-4o-mini` by default), and writes the report to Firestore.
4. Open the report. The web pulls it through `GET /analysis/reports/:id`.

### Call the API with a raw Firebase ID token

Useful for debugging without the web:

```bash
TOKEN=$(firebase login:ci)  # or get a real ID token from your client
curl http://localhost:3001/me -H "Authorization: Bearer $TOKEN"
```

`FirebaseAuthAdapter` validates the token; `MeController` returns the user.

### Call the API with an API key (server-to-server)

The second adapter in the chain (`defineApiKeyAuth()`) reads `X-Api-Key`. Useful for CI / cron jobs that don't have a Firebase session.

```bash
curl http://localhost:3001/analysis/reports \
  -H "X-Api-Key: $INTERNAL_API_KEY"
```

The adapter resolves the calling identity from a static config (see `apps/api/src/auth-api-key/api-key.adapter.ts`).

### Filter reports

```bash
GET /analysis/reports?github=org/repo
GET /analysis/reports?q=text          # search fullName and summary
GET /analysis/reports?status=completed
```

Filters live in the `analysisFeature` controller, not the framework.

### Firestore in production vs tests

Production requires Firebase Admin initialised by the app (`defineFirebaseAuth` or `ensureFirebaseAdminApp`). E2E tests swap in `InMemoryFirestoreBackend` through an explicit test stub — see `apps/api/test/stubs/`.

### Run the API against persistent SQLite

```env
DATABASE_PATH=./data/app.sqlite
```

Default is `:memory:` with `dropSchema: true`. Set `DATABASE_PATH` to keep state across restarts.

---

## 4. Reference

### Layout

```
examples/sample-code-review
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── app.module.ts                    Single composition root
│   │       ├── analysis/                        defineModuleResource (Firestore, OpenAI)
│   │       ├── auth-firebase/                   defineFirebaseAuth wiring
│   │       ├── auth-api-key/                    Second AuthBootstrap in the chain
│   │       ├── github/                          GitHub OAuth + repo browse
│   │       ├── repository/                      defineTypeOrmRepository + defineFirestoreRepository
│   │       ├── entities/                        Shared TypeORM entities (UserMetadata)
│   │       └── main.ts                          Bootstrap (helmet, validation, swagger)
│   └── web/
│       └── src/
│           ├── App.tsx                          Routes
│           ├── auth/                            Firebase client SDK wrapper
│           ├── pages/                           Login / dashboard / report views
│           ├── components/
│           └── lib/                             API client (forwards ID token)
└── packages/typescript-config/                  Shared tsconfig
```

### Auth chain (declared in `apps/api/src/app.module.ts`)

```typescript
RocketsModule.forRoot({
  auth: [
    defineFirebaseAuth({
      forRootAsync: { useFactory: resolveFirebaseAuthModuleOptions },
    }),
    defineApiKeyAuth(),
  ],
  resources: [
    defineModuleResource({ entities: [UserEntity] }),
    apiKeyAuthResource,
    // ...
  ],
})
```

Order is preserved end-to-end — Firebase tries first; API key is the fallback.

### Persistence

| Data | Backend | Configuration |
|---|---|---|
| GitHub OAuth tokens, `userMetadata` | SQLite (TypeORM) via root `repository:` | `DATABASE_PATH` or `:memory:` |
| Code-review reports | Firestore via `@bitwild/rockets-repository-firestore` | `FIREBASE_FIRESTORE_REPORTS_COLLECTION` (default `code_review_reports`) |

`CodeReviewReportEntity` uses `repository: codeReviewReportsRepository` from `defineFirestoreRepository()` with `collection` on the entity row — same bootstrap pattern as `defineTypeOrmRepository`. Services use `@InjectDynamicRepository` + `RepositoryInterface`; no Firestore types leak out of the analysis folder.

### Environment variables

| Var | Purpose |
|---|---|
| `PORT` | API HTTP port (default `3001`). |
| `DATABASE_PATH` | SQLite file path; default `:memory:`. |
| `FIREBASE_PROJECT_ID` | Required when not using the fake verifier. Must match the web's `VITE_FIREBASE_PROJECT_ID`. |
| `FIREBASE_SERVICE_ACCOUNT_PATH` / `GOOGLE_APPLICATION_CREDENTIALS` | Path to a Firebase service-account JSON. |
| `FIREBASE_USE_FAKE` | `'true'` switches Firebase Auth to the in-process fake verifier. |
| `FIREBASE_FIRESTORE_REPORTS_COLLECTION` | Firestore collection id for code-review reports. |
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` / `GITHUB_OAUTH_CALLBACK_URL` | GitHub OAuth App credentials. |
| `OPENAI_API_KEY` (also `OPEN_API_KEY`) | Enables real LLM output. Without it, the analyzer returns a stub. |
| `OPENAI_MODEL` | Override the default `gpt-4o-mini`. |
| `INTERNAL_API_KEY` | Static key accepted by the API-key adapter. |
| `VITE_API_URL`, `VITE_FIREBASE_*` | Web client config (see `apps/web/.env.example`). |

### Scripts

| Command | Description |
|---|---|
| `yarn dev` | API + Web in parallel. |
| `yarn dev:api` / `yarn dev:web` | Single app. |
| `yarn build` | Build both apps. |
| `yarn test:e2e` | API e2e with fakes. |
| `yarn test:e2e:ui` | Web e2e (Playwright). |

### Differences vs `rockets-starter`

| `rockets-starter` (GitHub) | This example |
|---|---|
| `@bitwild/rockets@1.0.0-alpha.9` from npm | `workspace:^` → local `packages/*` (integration test for in-development SDK) |
| Built-in `@bitwild/rockets-auth` | Firebase via `defineFirebaseAuth()` |
| Next.js web | Vite + React (same ports `3000` / `3001`) |
| PostgreSQL | SQLite + Firestore |

---

## License

BSD-3-Clause
