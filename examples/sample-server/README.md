# sample-server

[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Canonical reference app for `@bitwild/rockets` micro apps — JWT auth,
> zod-first resources, owner scoping, and `defineTypeOrmRepository`.

Monorepo dev: `@bitwild/*` resolves via `workspace:^` to local
`packages/*`. External apps install from npm (`@bitwild/rockets@alpha`).

For **Firebase / external IdP** auth, use
[sample-code-review](../sample-code-review) instead.

---

## 1. Introduction

`sample-server` is the runnable, e2e-tested reference for
`@bitwild/rockets`. It exists to:

- Demonstrate every flavour of `resources[]` bundle: `defineResource()`
  (CRUD), `defineSubResource()` (nested CRUD), `defineModuleResource()`
  (Nest slice with controllers + services), and `AuthBootstrap` pairs
  (`defineSampleAuth()` + entity resource).
- Show the canonical wiring of a `RepositoryBootstrap`
  (`defineTypeOrmRepository`) — entities are declared **once**, inside
  the bundle that owns them, then collected by the planner.
- Provide a copy-pasteable starting point for Stargate-provisioned
  **micro apps** that use in-app JWT signup/login (Path A shell with a
  local auth controller).

### Modules demonstrated

| Bundle | Kind | What it shows |
|---|---|---|
| `petResource` | `zodResource` | Full zod schema → entity + DTOs + hooks + sub-resource (`/pets/:petId/tags`). |
| `tagZodResource` | `zodResource` | Minimal zod CRUD (`/tags`). |
| `petVaccinationResource` | `defineSubResource` | Nested CRUD with handwritten entity/DTOs. |
| `authorZodResource` / `bookZodResource` | `zodResource` | DTO field roles (create-only / write-only), FK relation meta with response projection, keyed `operations` (soft delete + restore + replace). |
| `appointmentResource` | `defineResource` | Handwritten entity/DTOs; custom create handler wraps appointment + reminder writes in one `txScope`. |
| `reminderZodResource` | `zodResource` | Zod-driven; FK relation meta back to the (classic) appointment entity. |
| `petShareFeature` | `defineModuleResource` | Junction-table feature + custom controller. |
| `petTransferFeature` | `defineModuleResource` | Cross-resource workflow. |
| `adminFeature` | `defineModuleResource` | Admin-only routes via exported guard. |
| `auditFeature` | `defineModuleResource` | Cross-cutting audit trail. |
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

The `/auth/signup` and `/auth/login` routes live in
`src/auth/auth.controller.ts` — they are app code, not framework code.
The framework only enforces the chain via `AuthServerGuard`.

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

### Add a new zod CRUD resource

1. `src/resources/<thing>/<thing>.schema.ts` — zod schema + `f.*` field helpers (`@bitwild/rockets-core/zod`).
2. `src/resources/<thing>/<thing>.resource.ts` —
   `zodResource({ schema, hooks?, operations })`.
3. `src/resources/<thing>/index.ts` — re-export.
4. `src/app.module.ts` — add to `resources: [...]`.

Entity, create/update/response DTOs, and OpenAPI fields are compiled
from the schema. See `src/resources/tag/` (minimal) and
`src/resources/pet/` (full hooks + sub-resource).

Handwritten entity + DTO path still demonstrated in `pet-vaccination/` for comparison.

---

## 4. Reference

### Layout

```text
examples/sample-server
├── src/
│   ├── auth/                       AuthBootstrap + JWT signup/login
│   ├── repository/                 defineTypeOrmRepository bootstrap
│   ├── zod-bindings.ts             bindZodResources(typeOrmZodEntityCompiler)
│   ├── user-metadata.schema.ts     zod schema -> { entity, createDto, updateDto, responseDto }
│   ├── resources/                  CRUD + sub-resource + module bundles
│   ├── admin/                      Admin gate (defineModuleResource)
│   ├── audit/                      Cross-cutting audit (consumes adminFeature)
│   ├── events/                     Domain-event listeners
│   ├── providers/                  Unused reference adapter (mock-auth.adapter.ts) — not wired into app.module
│   ├── swagger/                    OpenAPI post-processing helpers
│   ├── app.module.ts               Single composition root
│   └── main.ts                     Bootstrap (helmet, validation, swagger, cors)
└── package.json
```

There is no handwritten `entities/`/`dto/` split for user metadata —
`user-metadata.schema.ts` is the zod source of truth and
`defineUserMetadata()` compiles the entity + create/update/response
DTOs from it (same pattern as every zod resource in `resources/`).

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port. |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowlist. |
| `SWAGGER_UI_PATH` | `api` | Path where Swagger UI mounts (`http://host/<path>`). |

`src/auth/auth.adapter.ts` signs/verifies JWTs with a **hardcoded**
dev-only secret (`JWT_SECRET` literal in that file) — it is not read
from the environment. A real Path A adapter would source the signing
key from a secret manager/env var instead.

### Related examples

| Example | Use when |
|---|---|
| [sample-code-review](../sample-code-review) | Firebase auth, API-key chain, mixed SQL + Firestore |
| [sample-server-auth](../sample-server-auth) | Built-in identity (Path B) with `defineRocketsAuth()` |

---

## License

BSD-3-Clause
