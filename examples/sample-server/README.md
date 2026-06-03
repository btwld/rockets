# sample-server

[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Canonical reference app for `@bitwild/rockets` micro apps — JWT auth, resource bundles, owner scoping, and `defineTypeOrmRepository`.

For **Firebase / external IdP** auth, use [sample-code-review](../sample-code-review) instead.

---

## 1. Introduction

`sample-server` is the runnable, e2e-tested reference for `@bitwild/rockets`. It exists to:

- Demonstrate every flavour of `resources[]` bundle: `defineResource()` (CRUD), `defineSubResource()` (nested CRUD), `defineModuleResource()` (Nest slice with controllers + services), and `AuthBootstrap` pairs (`defineSampleAuth()` + entity resource).
- Show the canonical wiring of a `RepositoryBootstrap` (`defineTypeOrmRepository`) — entities are declared **once**, inside the bundle that owns them, then collected by the planner.
- Provide a copy-pasteable starting point for Stargate-provisioned **micro apps** that use in-app JWT signup/login (Path A shell with a local auth controller).

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
| `defineSampleAuth` / `sampleAuthUserResource` | `AuthBootstrap` + entity row | In-process JWT signup + login. |

---

## 2. Get Started

### Install (from the monorepo root)

```bash
yarn install
yarn build
```

### Run

```bash
yarn workspace sample-server start:dev
# server: http://localhost:3000
# swagger: http://localhost:3000/api
```

### Run the e2e suite

```bash
yarn workspace sample-server test:e2e
```

Uses SQLite in-memory and supertest. All resources have at least one e2e test.

---

## 3. How-to Guides

### Sign up and log in

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

---

## 4. Reference

### Layout

```
examples/sample-server
├── src/
│   ├── auth/                       AuthBootstrap + JWT signup/login
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
| `PORT` | `3000` | HTTP port. |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowlist. |
| `SWAGGER_UI_PATH` | `api` | Path where Swagger UI mounts (`http://host/<path>`). |
| `JWT_SECRET` | (sample fallback) | Set in production. The sample adapter uses an in-process secret for dev. |

### Related examples

| Example | Use when |
|---|---|
| [sample-code-review](../sample-code-review) | Firebase auth, API-key chain, mixed SQL + Firestore |
| [sample-server-auth](../sample-server-auth) | Built-in identity (Path B) with `defineRocketsAuth()` |

---

## License

BSD-3-Clause
