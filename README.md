# Rockets

![Rockets Logo](https://raw.githubusercontent.com/btwld/rockets/main/assets/rockets-icon.svg)

[![CI](https://img.shields.io/github/actions/workflow/status/btwld/rockets/ci-merge.yml?branch=main&label=CI)](https://github.com/btwld/rockets/actions/workflows/ci-merge.yml)
[![Codecov](https://codecov.io/gh/btwld/rockets/branch/main/graph/badge.svg)](https://codecov.io/gh/btwld/rockets)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-green.svg)](LICENSE.txt)

**Stop rewriting auth and CRUD plumbing.** Rockets is a NestJS stack that
turns a list of feature *descriptions* into a working API — with auth,
repositories, validation, hooks, and Swagger already wired.

Bring your own users (Firebase / Auth0 / your IdP) **or** let Rockets
own the user table — the rest of the app looks the same.

---

## Table of contents

- [Why does Rockets exist?](#why-does-rockets-exist)
- [The two paths](#the-two-paths)
- [60-second tour](#60-second-tour)
- [How the packages fit together](#how-the-packages-fit-together)
- [Walkthrough — `sample-server` in 5 ideas](#walkthrough--sample-server-in-5-ideas)
- [Pick your starting point](#pick-your-starting-point)
- [Documentation map](#documentation-map)
- [Repository layout](#repository-layout)
- [Status](#status)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Why does Rockets exist?

Every NestJS backend you ever wrote starts the same way:

- Pick a JWT strategy. Write a guard. Write `/me`.
- Set up TypeORM (or Firestore). Register every entity at the root.
- Write a controller per resource: list, read, create, update, delete.
- Validate DTOs. Add Swagger decorators. Write tests.
- Implement owner scoping so user A doesn't see user B's data.

That's **the same 90% in every project**. The other 10% — your domain,
your business rules — is what you actually get paid to build.

Rockets is the 90%, behind one configuration object. You describe each
feature once (`entity`, `DTOs`, `hooks`) and the framework wires the
controller, the repository, the validation pipeline, and the Swagger
schema for you.

### Three properties that make it different from plain NestJS

1. **Composition is data.** Features are objects in a list, not
   `@Module()` classes. Adding a feature = appending to `resources[]`.
   Moving / deleting a feature = moving / deleting one folder.
2. **One contract for auth.** `validateToken(token) → AuthorizedUser`.
   That's it. Plug Firebase, Auth0, JWT, anything.
3. **The database is an adapter.** Domain code talks to
   `RepositoryInterface`. TypeORM is the common choice; Firestore,
   Mongo, and custom adapters are pluggable per app *and* per entity.

---

## The two paths

Pick the package that matches who owns your users:

| Who owns the user? | Package | What you write |
|---|---|---|
| **An external IdP** — Firebase, Auth0, Cognito, your enterprise SSO | [`@bitwild/rockets`](./packages/rockets-server/) | One adapter (`validateToken`) + your features |
| **Rockets itself** — signup, login, OTP, recovery, OAuth, admin | [`@bitwild/rockets-auth`](./packages/rockets-server-auth/) | Just your features. Auth is already there. |

Both paths use **the same composition surface** — `RocketsModule.forRoot({ … })`,
same `defineResource`, same `defineModuleResource`, same hooks. The only
difference is whether `auth:` points at your adapter or at the built-in
auth integration.

> Need only the engine — no `/me`, no global guard, no presentation? Use
> [`@bitwild/rockets-core`](./packages/rockets-core/) directly.

---

## 60-second tour

```bash
git clone https://github.com/btwld/rockets.git
cd rockets
yarn install && yarn build

# External-auth example (Firebase / Auth0 style). Default is JWT for demo.
yarn workspace sample-server start:dev
# → http://localhost:3000   Swagger: http://localhost:3000/api

# Built-in auth example: signup / login / OTP / admin all already wired
yarn workspace sample-server-auth start
```

Both examples boot against SQLite in-memory and have e2e suites you
can copy-paste from.

### External auth in 20 lines

```typescript
import { Module } from '@nestjs/common';
import { RocketsModule } from '@bitwild/rockets';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { FirebaseAuthAdapter } from './providers/firebase-auth.adapter';
import { UserMetadataEntity } from './entities/user-metadata.entity';

@Module({
  imports: [
    RocketsModule.forRootAsync({
      inject: [FirebaseAuthAdapter],
      useFactory: (auth) => ({
        auth,                                    // class implementing AuthAdapterInterface
        userMetadata: { entity: UserMetadataEntity },
      }),
      repository: TypeOrmRepositoryModule,
      resources: [/* your defineResource() / defineModuleResource() bundles */],
    }),
  ],
  providers: [FirebaseAuthAdapter],
})
export class AppModule {}
```

You implement `AuthAdapterInterface` once; everything else
(`defineResource`, hooks, ACL, `/me`) is reusable across IdPs.

### Built-in auth in 20 lines

```typescript
import { Module } from '@nestjs/common';
import { RocketsModule } from '@bitwild/rockets';
import { defineRocketsAuth } from '@bitwild/rockets-auth';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';

const auth = defineRocketsAuth({
  persistence: {
    module: TypeOrmRepositoryModule,
    entities: {
      user: UserEntity,
      userCredentials: UserCredentialEntity,
      userMetadata: UserMetadataEntity,
      userOtp: UserOtpEntity,
      role: RoleEntity,
      userRole: UserRoleEntity,
    },
  },
  userMetadata: { entity: UserMetadataEntity, createDto, updateDto },
  userCrud: { model: UserDto, dto: { createOne: UserCreateDto, updateOne: UserUpdateDto } },
  useFactory: () => ({
    settings: { role: { adminRoleName: 'admin' } },
    services: { mailerService },
  }),
});

@Module({
  imports: [
    RocketsModule.forRoot({
      auth,
      repository: TypeOrmRepositoryModule,
      userMetadata: auth.userMetadata,
      resources: [/* your features */],
    }),
  ],
})
export class AppModule {}
```

You get `/auth/signup`, `/auth/login`, `/auth/token/refresh`,
`/auth/password/recover`, `/otp`, `/admin/users`, `/admin/roles`,
`/admin/invitations` — plus RBAC, declarative CRUD via
`defineResource()`, and Swagger. **You did not write a controller.**

---

## How the packages fit together

```text
┌─────────────────────────────────────────────────────────────┐
│  @bitwild/rockets-common      shared utils, zero framework  │
│  @bitwild/rockets-repository  abstract data access (any DB) │
│  @bitwild/rockets-crud        generic CRUD generator        │
│  @bitwild/rockets-access-control  ACL / RBAC primitives     │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│  @bitwild/rockets-core     The ENGINE                       │
│  • Auth abstraction (AuthAdapterInterface, guard)           │
│  • Resource planner (defineResource, defineModuleResource)  │
│  • Dynamic repository wiring                                │
│  • CQRS handlers, Swagger registration                      │
│  No controllers. Both server packages build on this.        │
└─────────────┬─────────────────────────────────┬─────────────┘
              │                                 │
┌─────────────▼──────────────────┐ ┌────────────▼─────────────┐
│  @bitwild/rockets              │ │  @bitwild/rockets-auth   │
│  External-auth composition     │ │  Full built-in auth      │
│  Adds: /me, global guard,      │ │  Adds: signup, login,    │
│        composition root        │ │        OTP, OAuth, admin │
│                                │ │  Plugs into the same     │
│  You bring an adapter for      │ │  RocketsModule via       │
│  Firebase / Auth0 / your IdP   │ │  defineRocketsAuth()     │
└────────────────────────────────┘ └──────────────────────────┘
```

The principle: anything **both** server packages need lives in core.
Anything *only* the external-auth path needs lives in `@bitwild/rockets`.
Anything that has to do with Rockets owning the user table lives in
`@bitwild/rockets-auth`.

---

## Walkthrough — `sample-server` in 5 ideas

[`examples/sample-server/`](./examples/sample-server/) is the canonical
external-auth app. Five ideas explain how it's wired.

### 1. One `forRoot` at the root

```typescript
// examples/sample-server/src/app.module.ts (abbreviated)
@Module({
  imports: [
    RocketsModule.forRoot({
      auth,              // defineSampleAuth() (JWT) or defineFirebaseSampleAuth()
      userMetadata: { entity: UserMetadataEntity, createDto, updateDto },
      repository: defineTypeOrmRepository({ type: 'sqlite', database: ':memory:', synchronize: true }),
      resources: [
        petResource,
        petVaccinationResource,
        tagResource,
        appointmentResource,
        reminderResource,
        petShareFeature,
        petTransferFeature,
        adminFeature,
        auditFeature,
        eventsFeature,
      ],
    }),
  ],
})
export class AppModule {}
```

No parallel `TypeOrmModule.forRoot({ entities: [...] })`, no sibling
`AuthModule`. **Every entity flows through `resources[]` or `userMetadata`.**

### 2. The auth adapter is the only thing that knows the IdP

Same composition serves JWT and Firebase. Flip with `AUTH_PROVIDER`:

```typescript
const AUTH_PROVIDER = (process.env.AUTH_PROVIDER ?? 'jwt').toLowerCase();
const auth = AUTH_PROVIDER === 'firebase'
  ? defineFirebaseSampleAuth()
  : defineSampleAuth();
```

The pet/tag/appointment code is unaware of either choice.

### 3. CRUD is a description, not code

```typescript
export const petResource = defineResource({
  entity: PetEntity,
  hooks: [OwnerStampHook.for(PetEntity), AuditLogHook.for(PetEntity)],
  operations: {
    list: { response: PetResponseDto },
    create: { body: PetCreateDto, response: PetResponseDto },
    delete: { soft: true, returnDeleted: true },
    restore: { returnRestored: true },
  },
  subResources: {
    petTags: defineSubResource({
      entity: PetTagEntity,
      urlSegment: 'tags',
      parentOwnerColumn: 'userId',
      operations: { list: {}, create: { body: PetTagCreateDto } },
    }),
  },
});
```

You get the controller, the validation, the Swagger schema, the
sub-resource at `/pets/:petId/tags`, the owner-stamping, and the audit
trail — for free.

### 4. Three styles, side by side

| Style | When to reach for it | Sample bundles |
|---|---|---|
| **CRUD-shaped** (`defineResource`) | A normal entity API | `pet/`, `tag/`, `appointment/` |
| **Service + controller** (`defineModuleResource` with controllers) | A small custom HTTP surface | `pet-share/`, `admin/`, `audit/` |
| **CQRS-only** (`defineModuleResource` with `imports: [CqrsModule]`) | Business verbs with events, reuse outside HTTP | `pet-transfer/` |

Full pattern menu:
[`examples/sample-server/src/resources/PATTERNS.md`](./examples/sample-server/src/resources/PATTERNS.md).

### 5. Hooks own the "for every X, do Y" rules

Owner stamping, owner scoping, audit logging, path-scoped sub-resource
filtering — all live as repository hooks attached to the bundle, *not*
as code sprinkled across controllers:

```typescript
hooks: [
  OwnerStampHook.for(PetEntity),     // stamp userId on write
  OwnerScopeHook.for(PetEntity),     // filter list/read by userId
  AuditLogHook.for(PetEntity),       // write to audit trail
]
```

Hooks run at the repository layer, so they also catch direct
(non-HTTP) repository calls.

---

## Pick your starting point

| You want… | Install | Start from |
|---|---|---|
| **Built-in auth** (signup / login / OTP / recovery / admin) | `@bitwild/rockets-auth` | [`examples/sample-server-auth/`](./examples/sample-server-auth/) |
| **Bring-your-own auth** (Firebase, Auth0, custom IdP) + CRUD | `@bitwild/rockets` | [`examples/sample-server/`](./examples/sample-server/) |
| **Just the infrastructure** — no `/me`, no global guard | `@bitwild/rockets-core` | [`packages/rockets-core/`](./packages/rockets-core/) |

---

## Documentation map

| You want to… | Read |
|---|---|
| Understand the **engine** | [`packages/rockets-core/README.md`](./packages/rockets-core/README.md) |
| Wire **external auth** (Firebase, Auth0, …) | [`packages/rockets-server/README.md`](./packages/rockets-server/README.md) |
| Use **built-in auth** (signup / login / RBAC) | [`packages/rockets-server-auth/README.md`](./packages/rockets-server-auth/README.md) |
| See a **complete external-auth app** | [`examples/sample-server/README.md`](./examples/sample-server/README.md) + [`CONFIGURATION.md`](./examples/sample-server/CONFIGURATION.md) |
| See a **complete built-in-auth app** | [`examples/sample-server-auth/README.md`](./examples/sample-server-auth/README.md) |
| Pick **CRUD vs service vs CQRS** for a feature | [`examples/sample-server/src/resources/PATTERNS.md`](./examples/sample-server/src/resources/PATTERNS.md) |
| Follow the **agent rules** (architecture invariants) | [`AGENTS.md`](./AGENTS.md) |
| Read deeper **architecture / why** notes | [`ai-task-context/`](./ai-task-context/) |

---

## Repository layout

| Directory | Contents |
|---|---|
| [`packages/rockets-core/`](./packages/rockets-core/) | Auth abstraction, CQRS, resource planner, repository registration, Swagger registration. The engine. |
| [`packages/rockets-server/`](./packages/rockets-server/) | Composition root for **external** auth (`/me`, global guard). |
| [`packages/rockets-server-auth/`](./packages/rockets-server-auth/) | Full built-in auth: JWT, signup, login, OTP, recovery, OAuth, admin. |
| [`packages/rockets-common/`](./packages/rockets-common/) | Shared utilities, hooks, Swagger UI re-export. |
| [`packages/rockets-repository/`](./packages/rockets-repository/) | Abstract data access. No ORM in the type layer. |
| [`packages/rockets-crud/`](./packages/rockets-crud/) | Generic CRUD generator. |
| [`packages/rockets-access-control/`](./packages/rockets-access-control/) | ACL / RBAC primitives. |
| [`examples/sample-server/`](./examples/sample-server/) | Canonical external-auth reference app (JWT + Firebase via env switch). |
| [`examples/sample-server-auth/`](./examples/sample-server-auth/) | Canonical built-in-auth reference app (RBAC + invitations). |
| [`development-guides/`](./development-guides/) | AI-oriented playbooks (configuration, patterns, testing). |

---

## Status

Currently on `feature/version8`: the migration to
`@concepta/nestjs-*` v8 is complete for the auth-side packages. A few
transitive dependencies stay on v7 until upstream ships v8 (OAuth
providers, access-control, email, event, swagger-ui).

Public-facing API and the sample apps work today.

---

## Contributing

Contributor docs live in [`AGENTS.md`](./AGENTS.md) and the per-package
guides. Open an issue describing the change before opening a PR.

---

## Security

Found a vulnerability? **Do not open a public issue.** Email
**<security@bitwild.com>** — see [`SECURITY.md`](./SECURITY.md) for the
disclosure timeline.

---

## License

BSD-3-Clause — see [`LICENSE.txt`](./LICENSE.txt).
