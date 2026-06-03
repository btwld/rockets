# sample-server-auth

[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Reference app for `@bitwild/rockets-auth` — built-in user system (signup, login, OTP, password recovery, invitations, admin user CRUD) with role-based access control and ownership-scoped resources.

---

## 1. Introduction

`sample-server-auth` is the runnable reference for the built-in auth path. While `sample-server` shows **Path A** (in-app JWT adapter + signup/login controller), this app shows **Path B** (the framework owns the user table). For Firebase / external IdP, see [sample-code-review](../sample-code-review).

What it demonstrates:

- `defineRocketsAuth()` end-to-end: persistence entities, user-metadata, role CRUD, invitations, access control, mailer wiring.
- Three-role RBAC (`admin`, `manager`, `user`) defined in `src/app.acl.ts` via the `accesscontrol` library.
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

### Run

```bash
yarn workspace sample-server-auth start:dev
# server: http://localhost:3000
# swagger: http://localhost:3000/api
```

Data is SQLite in-memory with `dropSchema: true` — every restart begins with an empty database.

### E2E tests

```bash
yarn workspace sample-server-auth test:e2e
```

---

## 3. How-to Guides

### Sign up the first admin user

By default new accounts get the `user` role (`settings.role.defaultUserRoleName = 'user'`). For a fresh dev DB, sign up and promote manually via the seeded admin route or by writing to the `user_role` join table.

```bash
# Signup
curl -X POST http://localhost:3000/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"Secret123!","username":"admin"}'

# Login → access token
TOKEN=$(curl -sX POST http://localhost:3000/token/password \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Secret123!"}' | jq -r .accessToken)

# Inspect
curl http://localhost:3000/me -H "Authorization: Bearer $TOKEN"
```

### Exercise the role hierarchy

The three roles in `src/app.acl.ts`:

| Role | Pet / Vaccination / Appointment |
|---|---|
| `admin` | `createAny`, `readAny`, `updateAny`, `deleteAny` |
| `manager` | `createAny`, `readAny`, `updateAny` (no delete) |
| `user` | `createOwn`, `readOwn`, `updateOwn`, `deleteOwn` (ownership-checked by `PetAccessQueryService`) |

The `PetAccessQueryService.canAccess()` runs **after** the grant table matches — it refines `:own` rules by comparing `pet.userId` to the requester's id. The same service intentionally denies delete for users carrying both `manager` and `user` roles (manager has no delete grant; the `user` `deleteOwn` would otherwise leak through).

### Add a new resource that follows the same rules

1. Add the resource string to `AppResource` in `src/app.acl.ts` so the grant table covers it.
2. Implement the entity, DTOs, and `createXxxResource()` like `src/modules/pet/`.
3. Append the resource to the `resources: [...]` list in `src/app.module.ts`.

If the resource needs custom ownership semantics, copy `pet-access-query.service.ts` and pass it under `accessControl.queryServices` in `defineRocketsAuth({...})`.

### Plug a real mailer

`src/app.module.ts` ships a logger-backed `mailerService`. Replace with an SES / SendGrid / SMTP adapter that implements `EmailServiceInterface`:

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

Skip controllers your app does not need. Pass `disableController` to the `RocketsAuthModule` portion (via `defineRocketsAuth` config):

```typescript
defineRocketsAuth({
  // ...
  disableController: { invitation: true, invitationAcceptance: true },
});
```

---

## 4. Reference

### Layout

```
examples/sample-server-auth
├── src/
│   ├── app.module.ts                Single composition root
│   ├── app.acl.ts                   Role + resource enums + accesscontrol grants
│   ├── access-control.service.ts    AccessControlServiceInterface impl
│   ├── main.ts                      Bootstrap (helmet, validation, swagger)
│   ├── repository/                  defineTypeOrmRepository bootstrap (shared with defineRocketsAuth)
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
| `/admin/users`, `/admin/users/:userId/roles` | Admin user + role mgmt. |
| `/admin/invitations`, `/invitation-acceptance`, … | Invitation flow. |

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port. |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowlist. |
| `SWAGGER_UI_PATH` | `api` | Swagger UI mount path. |

### Persistence wiring

A single `defineTypeOrmRepository({...})` bootstrap is shared by `RocketsModule.forRoot({ repository })` and `defineRocketsAuth({ persistence: { module } })`. The planner derives the full entity list from `resources[]`, `userMetadata.entity`, and the auth `persistence.entities` map — there is no top-level `TypeOrmModule.forRoot({ entities: [...] })` to keep in sync. Pet resources omit per-resource `persistence` so they inherit the root adapter.

---

## License

BSD-3-Clause
