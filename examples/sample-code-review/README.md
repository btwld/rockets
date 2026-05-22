# `sample-code-review`

Monorepo **inside rockets**: the layout is inspired by [rockets-starter](https://github.com/btwld/rockets-starter) (`apps/api` + `apps/web`), but the backend uses **`workspace:^`** — local packages in `packages/*`, **not** the starter's npm versions such as `@bitwild/rockets@1.0.0-alpha.7`.

```text
rockets/                          ← SDK monorepo (source of truth)
├── packages/rockets-core, rockets-server, …
└── examples/sample-code-review/
    ├── apps/
    │   ├── api/    NestJS + local Rockets (`api`)    :3001
    │   └── web/    Vite + React (`web`)              :3000
    └── packages/typescript-config/   (shared TS only)
```

## Authentication (Firebase → token → Rockets server)

Firebase is **not** the application backend. It only issues the **ID token**; the **Rockets server** validates that token on **every** request.

```text
Web (Firebase Auth)          API (@bitwild/rockets)
─────────────────          ───────────────────────
email/password login  →     (does not participate in login)
getIdToken()          →     Authorization: Bearer <Firebase JWT>
                       →     AuthServerGuard (global)
                       →     FirebaseAuthAdapter.validateToken()
                       →     request.user = AuthorizedUser (uid, email, roles…)
                       →     GET /me, /github/*, /analysis/*
```

| Layer | Responsibility |
|-------|----------------|
| **Firebase (client)** | Web login; `user.getIdToken()` |
| **`@bitwild/rockets-adapter-firebase`** | Admin SDK / verifier: `verifyIdToken` |
| **`@bitwild/rockets` (`RocketsModule`)** | `APP_GUARD` + `MeController` + protected routes |
| **Your controllers** | `@AuthUser()`, `@Ctx()` — user already authenticated |

API config: `RocketsModule.forRoot({ auth: defineFirebaseAuth(), … })` with `authProviderExternallyManaged: true` (the user lives in Firebase, not in the local signup table).

**For real tokens to work:** the same `projectId` must be used in web (`VITE_FIREBASE_PROJECT_ID`) and API (`FIREBASE_PROJECT_ID=rockets-review-demo`). The service account JSON is **optional** in development — the Admin SDK can start with only `projectId`. `FIREBASE_USE_FAKE` must stay **disabled** in `apps/api/.env`.

Quick verification after web login (DevTools → Network → any API call) or:

```bash
curl -H "Authorization: Bearer <firebase-id-token>" http://localhost:3001/me
```

## Local SDK (required)

`apps/api/package.json` declares:

```json
"@bitwild/rockets": "workspace:^",
"@bitwild/rockets-core": "workspace:^",
"@bitwild/rockets-adapter-firebase": "workspace:^"
```

Yarn resolves these to `packages/rockets-server`, `packages/rockets-core`, and so on — the same codebase used by [`sample-server`](../sample-server/).

**Before the first `dev`**, build the parent monorepo packages:

```bash
# from the rockets repository root
yarn build
```

## Quick start

### 1. API (`apps/api/.env`)

```bash
cp apps/api/.env.example apps/api/.env
```

**GitHub OAuth App → Authorization callback URL:**

```text
http://localhost:3000/auth/github/callback
```

It must match `GITHUB_OAUTH_CALLBACK_URL` in the API `.env`.

**Firebase Admin:** `apps/api/secrets/firebase-service-account.json`

### 2. Web (`apps/web/.env`)

```bash
cp apps/web/.env.example apps/web/.env
```

```env
VITE_API_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. Run API + Web

From the **rockets root** (recommended):

```bash
yarn build
yarn workspace sample-code-review dev
```

Or only inside the example:

```bash
cd examples/sample-code-review
yarn dev
```

| App | URL |
|-----|-----|
| Web | http://localhost:3000 |
| API | http://localhost:3001 |
| Swagger | http://localhost:3001/api |

### 4. Flow

1. Sign in with Firebase (email/password)
2. Connect GitHub → callback `/auth/github/callback`
3. Choose a repo → Run code review (GitHub API + OpenAI `gpt-4o-mini` when `OPENAI_API_KEY` or `OPEN_API_KEY` is present in `apps/api/.env`)
4. Open the report

**OpenAI (optional, inexpensive for testing):**

```env
OPENAI_API_KEY=sk-...   # or OPEN_API_KEY
OPENAI_MODEL=gpt-4o-mini
```

## Two persistence backends

| Data | Backend | Config |
|------|---------|--------|
| GitHub OAuth / connection, `userMetadata` | **SQLite** (TypeORM via `repository` in `RocketsModule`) | `DATABASE_PATH` or `:memory:` |
| Code review reports | **Firestore** via `@bitwild/rockets-repository-firestore` | `FIREBASE_FIRESTORE_REPORTS_COLLECTION` (default: `code_review_reports`) |

`CodeReviewReportEntity` declares `repository: FirestoreRepositoryModule` in its bundle — the same per-entity override pattern Rockets uses for TypeORM. Services use `@InjectDynamicRepository` + `RepositoryInterface`, not custom storage code.

Each report is stored as a document in `code_review_reports/{reportId}`. The list endpoint supports API filters:

- `GET /analysis/reports?github=org/repo` — GitHub repository
- `GET /analysis/reports?q=text` — search in `fullName` and `summary`
- `GET /analysis/reports?status=completed` — job status

E2E uses `FIREBASE_FIRESTORE_USE_FAKE=true` (in-memory Firestore). In production, enable **Cloud Firestore** in the Firebase Console (Native mode).

New monorepo package: `packages/rockets-repository-firestore` (mirrors the role played by `@concepta/nestjs-repository-typeorm`).

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | API + Web in parallel (`concurrently`) |
| `yarn dev:api` | API only |
| `yarn dev:web` | Web only |
| `yarn build` | Build both apps |
| `yarn test:e2e` | API E2E (test fakes enabled) |

From the **rockets** root:

| Command | Description |
|---------|-------------|
| `yarn sample-code-review:dev` | `yarn build` (local SDK) + `dev` |
| `yarn sample-code-review:test:e2e` | build + e2e |

## Difference vs `rockets-starter`

| `rockets-starter` (GitHub) | This example |
|----------------------------|--------------|
| `@bitwild/rockets@1.0.0-alpha.7` from npm | `workspace:^` → local `packages/*` |
| Built-in `@bitwild/rockets-auth` | Firebase via `defineFirebaseAuth()` |
| Next.js web | Vite + React (same ports 3000/3001) |
| PostgreSQL | SQLite (like `sample-server`) |

## Related

- [`../sample-server/`](../sample-server/) — canonical Rockets config
- [`apps/api/src/app.module.ts`](apps/api/src/app.module.ts) — `RocketsModule.forRoot`
