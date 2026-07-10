# sample-server-auth

[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Reference app for `@bitwild/rockets-auth` — built-in user system
> (signup, login, OTP, password recovery, invitations, admin user CRUD)
> with role-based access control and ownership-scoped resources.

Monorepo dev: `@bitwild/*` resolves via `workspace:^`. External apps:
`yarn add @bitwild/rockets-auth@alpha`.

---

## 1. Introduction

`sample-server-auth` is the runnable reference for the built-in auth
path. While `sample-server` shows **Path A** (in-app JWT adapter +
signup/login controller), this app shows **Path B** (the framework owns
the user table). For Firebase / external IdP, see
[sample-code-review](../sample-code-review).

What it demonstrates:

- `defineRocketsAuth()` end-to-end: persistence entities, user-metadata,
  role CRUD, invitations, access control, mailer wiring.
- Three-role RBAC (`admin`, `manager`, `user`) defined in
  `src/app.acl.ts` via the `accesscontrol` library.
- Per-resource ownership checks via a `CanAccess` query service (`PetAccessQueryService`).
- Three resources sharing the same access rules (`pet`, `pet-vaccination`, `pet-appointment`).
- A sample mailer implementation (logger-backed for dev) wired through `services.mailerService`.
- Custom notification command handlers for recovery and verify flows.

---

## 2. Get Started

### Install (from the monorepo root)

```bash
yarn install
yarn build
```

### Configure

The app **requires** an initial admin account and exits immediately at
boot if these are unset (see `main.ts`):

```bash
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=StrongP@ssw0rd
```

See `src/.env.example` for the shape. There is no
`dotenv`/`ConfigModule` auto-loading in this app — export these in your
shell or process manager before starting.

### Run

```bash
yarn workspace sample-server-auth start:dev
# server: http://localhost:3001
# swagger: http://localhost:3001/api
```

Data is SQLite in-memory with `dropSchema: true` — every restart begins
with an empty database. On every boot, `main.ts` also seeds the
`admin`, `manager`, and `user` roles and creates (or promotes) a user
for `ADMIN_EMAIL` with the `admin` role — see "Log in as the seeded
admin" below.

### E2E tests

```bash
yarn workspace sample-server-auth test:e2e
```

---

## 3. How-to Guides

### Log in as the seeded admin

`main.ts` seeds the admin at every boot — there is no manual promotion
step. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` (see "Configure" above),
start the app, then log in directly:

```bash
TOKEN=$(curl -sX POST http://localhost:3001/token/password \
  -H 'Content-Type: application/json' \
  -d '{"username":"'"$ADMIN_EMAIL"'","password":"'"$ADMIN_PASSWORD"'"}' | jq -r .accessToken)

curl http://localhost:3001/me -H "Authorization: Bearer $TOKEN"
```

New self-signups (via `POST /signup`) get the `user` role by default
(`settings.role.defaultUserRoleName = 'user'`). To promote one of those
to `admin`/`manager`, use `/admin/users/:userId/roles` while
authenticated as an admin.

### Exercise the role hierarchy

The three roles in `src/app.acl.ts`:

| Role | Pet / Vaccination / Appointment |
|---|---|
| `admin` | `createAny`, `readAny`, `updateAny`, `deleteAny` |
| `manager` | `createAny`, `readAny`, `updateAny` (no delete) |
| `user` | `createOwn`, `readOwn`, `updateOwn`, `deleteOwn` (ownership-checked by `PetAccessQueryService`) |

The `PetAccessQueryService.canAccess()` runs **after** the grant table
matches — it refines `:own` rules by comparing `pet.userId` to the
requester's id. The same service intentionally denies delete for users
carrying both `manager` and `user` roles (manager has no delete grant;
the `user` `deleteOwn` would otherwise leak through).

### Add a new resource that follows the same rules

1. Add the resource string to `AppResource` in `src/app.acl.ts` so the
   grant table covers it.
2. Implement the entity, DTOs, and `createXxxResource()` like
   `src/modules/pet/`.
3. Append the resource to the `resources: [...]` list in
   `src/app.module.ts`.

If the resource needs custom ownership semantics, copy
`pet-access-query.service.ts` and pass it under
`accessControl.queryServices` in `defineRocketsAuth({...})`.

### Plug a real mailer

`src/app.module.ts` ships a logger-backed `mailerService`. Replace with
an SES / SendGrid / SMTP adapter that implements
`EmailServiceInterface`:

```typescript
services: {
  mailerService: {
    sendMail: async (opts) => {
      await sesClient.sendEmail(buildSesPayload(opts));
    },
  },
}
```

### Disable parts of the built-in stack

Skip controllers your app does not need. Pass `disableController` to
the `RocketsAuthModule` portion (via `defineRocketsAuth` config):

```typescript
defineRocketsAuth({
  // ...
  disableController: { invitation: true, invitationAcceptance: true },
});
```

---

## 4. Reference

### Layout

```text
examples/sample-server-auth
├── src/
│   ├── app.module.ts                Single composition root
│   ├── app.acl.ts                   Role + resource enums + accesscontrol grants
│   ├── access-control.service.ts    AccessControlServiceInterface impl
│   ├── main.ts                      Bootstrap (helmet, validation, swagger)
│   ├── repository/                  defineTypeOrmRepository bootstrap (shared with defineRocketsAuth)
│   ├── shared/persistence/          AuditedSqliteEntity (app-owned audit columns)
│   ├── modules/
│   │   ├── user/                    UserEntity + credential / otp / role-link entities + DTOs
│   │   ├── role/                    RoleEntity + DTOs
│   │   └── pet/                     Pet, PetVaccination, PetAppointment resources + access query service
│   └── notification/                Sample recovery / verify notification command handlers
└── package.json
```

### Auth surface (exposed by the bundle)

| Route | Purpose |
|---|---|
| `POST /signup` | New user signup. Wired through `userCrud`. |
| `POST /token/password` | Login (username + password → access + refresh token). |
| `POST /token/refresh` | Refresh the access token. |
| `GET /me`, `PATCH /me` | From `@bitwild/rockets`. |
| `PATCH /me/password` | Password change. |
| `POST /otp`, `PATCH /otp` | OTP issue / verify. |
| `POST /recovery/*` | Password recovery flow (wired to notification handlers). |
| `/admin/users`, `/admin/users/:userId/roles` | Admin user CRUD + role assignment. |
| `/admin/roles` | Role CRUD (`roleCrud` config). |
| `/admin/invitations`, `/invitation-acceptance`, … | Invitation flow. |

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `ADMIN_EMAIL` | **required** | Email for the admin user seeded on every boot (`main.ts`). No default — the app exits if unset. |
| `ADMIN_PASSWORD` | **required** | Password for the seeded admin user. No default — the app exits if unset. |
| `PORT` | `3001` | HTTP port (`process.env.PORT \|\| 3001`). |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowlist. |
| `SWAGGER_UI_PATH` | `api` | Swagger UI mount path. |

### Persistence wiring

A single `defineTypeOrmRepository({...})` bootstrap is shared by
`RocketsModule.forRoot({ repository })` and `defineRocketsAuth({
persistence: { module } })`. The planner derives the full entity list
from `resources[]`, `userMetadata.entity`, and the auth
`persistence.entities` map — there is no top-level
`TypeOrmModule.forRoot({ entities: [...] })` to keep in sync. Pet
resources omit per-resource `persistence` so they inherit the root
adapter.

### Entity definitions (app-owned persistence)

Auth and domain tables use **explicit TypeORM entity classes** in this
sample — not `@concepta/nestjs-typeorm-ext` (v7-only, deprecated).
Shared audit columns (`id`, `dateCreated`, `dateUpdated`, `dateDeleted`,
`version`) live in `src/shared/persistence/audited-sqlite.entity.ts`;
each entity declares its domain columns and relations on top.

Pass those classes to `defineRocketsAuth({ persistence: { entities } })`
and register app resources via `defineResource()` as usual. For
zod-first CRUD (as in `sample-server`), use `zodResource` +
`typeOrmZodEntityCompiler` instead of hand-written entities where that
fits your resource shape.

---

## License

BSD-3-Clause
