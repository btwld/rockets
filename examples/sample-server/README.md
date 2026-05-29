# sample-server

[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Canonical reference app for `@bitwild/rockets` (external-auth composition layer). Demonstrates a working app built on top of two interchangeable auth adapters and the full set of resource bundle shapes.

---

## 1. Introduction

`sample-server` is the runnable, e2e-tested reference for `@bitwild/rockets`. It exists to:

- Prove the `AuthAdapterInterface` contract by swapping between an in-process JWT adapter and the Firebase adapter without touching app code.
- Demonstrate every flavour of `resources[]` bundle: `defineResource()` (CRUD), `defineSubResource()` (nested CRUD), `defineModuleResource()` (Nest slice with controllers + services), and `defineAuthFeature()` (adapter + controllers + entity in one).
- Show the canonical wiring of a `RepositoryBootstrap` (`defineTypeOrmRepository`) — entities are declared **once**, inside the bundle that owns them, then collected by the planner.
- Provide a copy-pasteable starting point for new apps.

### Modules demonstrated

| Bundle | Kind | What it shows |
|---|---|---|
| `petResource` | `defineResource` | Basic CRUD with `OwnerStampHook` + `OwnerScopeHook`. |
| `petVaccinationResource` | `defineSubResource` | Nested CRUD (`/pets/:petId/vaccinations`) with path-scoped access. |
| `tagResource` | `defineResource` | Many-to-many helper via `relation()`. |
| `appointmentResource` / `reminderResource` | `defineResource` | CRUD + custom hooks for date-window filtering. |
| `petShareFeature` | `defineModuleResource` | Junction-table feature + custom controller for share/unshare. |
| `petTransferFeature` | `defineModuleResource` | Cross-resource workflow (transfer ownership). |
| `adminFeature` | `defineModuleResource` | Admin-only routes guarded by a custom `AdminGuard` exposed via `exports`. |
| `auditFeature` | `defineModuleResource` | Cross-cutting audit trail consuming `adminFeature`'s exported guard. |
| `eventsFeature` | `defineModuleResource` | Domain-event listeners. |
| `authFeature` / `defineSampleAuth` | `defineAuthFeature` | In-process JWT signup + login. |
| `defineFirebaseSampleAuth` | `RocketsAuthIntegration` | External-IdP wiring without signup/login. |

---

## 2. Get Started

### Install (from the monorepo root)

```bash
yarn install
yarn build
```

### Run with the JWT adapter (default)

```bash
yarn workspace sample-server start:dev
# server: http://localhost:3000
# swagger: http://localhost:3000/api
```

### Run with the Firebase adapter (fake verifier for local dev)

```bash
AUTH_PROVIDER=firebase yarn workspace sample-server start:dev
```

The Firebase wiring uses an in-process fake verifier (`SampleFakeFirebaseVerifier`) so you don't need a Firebase project to exercise the contract. Swap it for `firebaseApp` in production.

### Run the e2e suite

```bash
yarn workspace sample-server test:e2e
```

Uses SQLite in-memory and supertest. All resources have at least one e2e test.

---

## 3. How-to Guides

### Sign up and log in (JWT adapter)

```bash
# Signup
curl -X POST http://localhost:3000/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"u@example.com","password":"Secret123!","name":"User"}'

# Login → access token
TOKEN=$(curl -sX POST http://localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"u@example.com","password":"Secret123!"}' | jq -r .accessToken)

# Use the token
curl http://localhost:3000/me -H "Authorization: Bearer $TOKEN"
```

The `/auth/signup` and `/auth/login` routes live in `src/auth/auth.controller.ts` — they are app code, not framework code. The framework only enforces the chain via `AuthServerGuard`.

### Create a pet (owner-scoped resource)

```bash
curl -X POST http://localhost:3000/pets \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Loki","species":"cat"}'

# List only sees the caller's pets
curl http://localhost:3000/pets -H "Authorization: Bearer $TOKEN"
```

`OwnerStampHook` writes `userId`; `OwnerScopeHook` filters reads.

### Add a new CRUD entity in five files

1. `src/resources/<thing>/<thing>.entity.ts` — TypeORM entity (with `userId` if owner-scoped).
2. `src/resources/<thing>/<thing>.dto.ts` — `Create`, `Update`, `Response` DTOs (every public field needs `@ApiProperty()` / `@ApiPropertyOptional()`).
3. `src/resources/<thing>/<thing>.resource.ts` — `defineResource({ entity, hooks })`.
4. `src/resources/<thing>/index.ts` — re-export.
5. `src/app.module.ts` — add the new resource to the `resources: [...]` array.

Then `yarn workspace sample-server start:dev` and the routes (`GET/POST/PATCH/DELETE /things`) are live with validation, swagger, and ownership scoping.

### Switch auth provider without touching app code

```bash
AUTH_PROVIDER=jwt      yarn workspace sample-server start:dev    # default
AUTH_PROVIDER=firebase yarn workspace sample-server start:dev    # external IdP
```

`src/app.module.ts` reads the env var and picks `defineSampleAuth()` (JWT) or `defineFirebaseSampleAuth()` (Firebase). Both produce something `RocketsModule.forRoot({ auth })` accepts — the rest of the app (resources, hooks, /me, swagger) is identical.

---

## 4. Reference

### Layout

```
examples/sample-server
├── src/
│   ├── auth/                       JWT adapter + AuthFeatureBundle
│   ├── auth-firebase/              Firebase RocketsAuthIntegration (fake verifier in dev)
│   ├── repository/                 RepositoryBootstrap wrapper
│   ├── resources/                  CRUD + sub-resource + module bundles
│   ├── admin/                      Admin gate (defineModuleResource)
│   ├── audit/                      Cross-cutting audit (consumes adminFeature)
│   ├── events/                     Domain-event listeners
│   ├── dto/                        Shared DTOs (UserMetadata*)
│   ├── entities/                   Shared entities (UserMetadataEntity)
│   ├── swagger/                    OpenAPI post-processing helpers
│   ├── app.module.ts               Single composition root
│   └── main.ts                     Bootstrap (helmet, validation, swagger, cors)
└── package.json
```

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `AUTH_PROVIDER` | `jwt` | `jwt` or `firebase` — selects the auth wiring in `app.module.ts`. |
| `PORT` | `3000` | HTTP port. |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowlist. |
| `SWAGGER_UI_PATH` | `api` | Path where Swagger UI mounts (`http://host/<path>`). |
| `JWT_SECRET` | (sample fallback) | Set in production. The sample adapter uses an in-process secret for dev. |

---

## License

BSD-3-Clause
