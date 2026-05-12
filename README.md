# Rockets

![Rockets Logo](https://raw.githubusercontent.com/btwld/rockets/main/assets/rockets-icon.svg)

[![CI](https://img.shields.io/github/actions/workflow/status/btwld/rockets/ci-merge.yml?branch=main&label=CI)](https://github.com/btwld/rockets/actions/workflows/ci-merge.yml)
[![Codecov](https://codecov.io/gh/btwld/rockets/branch/main/graph/badge.svg)](https://codecov.io/gh/btwld/rockets)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE.txt)

> **Database-agnostic NestJS auth + CRUD in one declarative module.**
> Built-in JWT signup/login OR plug your own IdP — same composition
> surface, same protocol, swap with one import.

---

## Table of contents

- [Introduction](#introduction)
- [Tutorial — 60-second tour](#tutorial--60-second-tour)
- [How-to guides](#how-to-guides)
- [Reference](#reference)
- [Explanation](#explanation)
- [Repository layout](#repository-layout)
- [Status](#status)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Introduction

Rockets is a stack of NestJS packages that turn declarative bundles
into a working application. You describe **what** the app exposes —
entities, controllers, auth provider, persistence adapter — and the
framework wires the controllers, repositories, guards, and Swagger.

Three properties make it different from plain NestJS:

1. **Composition is data.** Everything flows through one configuration
   object: `repository`, `userMetadata`, and a `resources[]` list
   of `defineResource()` (CRUD) and `defineModuleResource()` (non-CRUD)
   bundles. No `@Module` per feature.
2. **Bundles are atomic.** A single `defineResource()` carries the
   entity, the controller, and the persistence row — moving / deleting
   / cloning a feature is a single operation.
3. **Persistence is an adapter.** The contract is `RepositoryInterface`.
   TypeORM is the common case; Firestore, Mongo, custom adapters are
   pluggable per app or per entity.

Two ways to use it:

| Path | Auth model | Package |
|---|---|---|
| **Built-in auth** | Rockets owns the user table — signup/login/OTP/RBAC/admin out of the box | [`@bitwild/rockets-auth`](./packages/rockets-server-auth/) |
| **Bring your own** | Users live in Firebase / Auth0 / Cognito — Rockets validates their tokens | [`@bitwild/rockets`](./packages/rockets-server/) |

You implement the same `AuthAdapterInterface` in either case; the
difference is whether `@bitwild/rockets-auth` plugs its built-in JWT
provider for you, or you plug yours.

---

## Tutorial — 60-second tour

```bash
git clone https://github.com/btwld/rockets.git
cd rockets
yarn install
yarn build

# Built-in auth example: signup/login/OTP/admin all working
yarn workspace sample-server-auth start
# → http://localhost:3000     (Swagger at /api)

# OR — external auth example (Firebase / Auth0 style)
yarn workspace sample-server start:dev
```

Both examples boot against SQLite in-memory and have e2e suites you can
copy-paste from.

### Built-in auth in 20 lines

```typescript
import { RocketsAuthModule } from '@bitwild/rockets-auth';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({ /* …your TypeORM config… */ }),

    RocketsAuthModule.forRootAsync({
      repositoryPersistence: {
        module: TypeOrmRepositoryModule,
        entities: {
          user:            UserEntity,
          userCredentials: UserCredentialEntity,
          userMetadata:    UserMetadataEntity,
          userOtp:         UserOtpEntity,
          role:            RoleEntity,
          userRole:        UserRoleEntity,
        },
      },
      useFactory: () => ({
        settings: { role: { adminRoleName: 'admin' } /* email, otp */ },
        services: { mailerService },
      }),
    }),
  ],
})
export class AppModule {}
```

You get `/signup`, `/token/password`, `/token/refresh`, `/me/password`,
`/otp`, `/admin/users`, `/admin/roles`, `/admin/invitations` — plus
RBAC, declarative CRUD via `defineResource()`, and Swagger UI. **Zero
controllers to write.**

### External auth in 20 lines

```typescript
import { RocketsModule } from '@bitwild/rockets';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { FirebaseAuthAdapter } from './providers/firebase-auth.adapter';

@Module({
  imports: [
    TypeOrmModule.forRoot({ entities: [UserMetadataEntity], synchronize: true }),

    RocketsModule.forRootAsync({
      inject: [FirebaseAuthAdapter],
      useFactory: (auth) => ({
        authProvider: auth,
        userMetadata: { entity: UserMetadataEntity, createDto, updateDto },
      }),
      repository: TypeOrmRepositoryModule,
    }),
  ],
  providers: [FirebaseAuthAdapter],
})
export class AppModule {}
```

Implement `AuthAdapterInterface` once; reuse the same composition
surface for everything else (`defineResource`, `defineModuleResource`,
hooks, ACL, /me).

### Pick your starting point

| You want… | Install | Start from |
|---|---|---|
| **Built-in auth** (signup / login / OTP / recovery / admin) | `@bitwild/rockets-auth` | [`examples/sample-server-auth/`](./examples/sample-server-auth/) |
| **Bring-your-own auth** (Auth0, Firebase, custom IdP) + CRUD | `@bitwild/rockets` | [`examples/sample-server/`](./examples/sample-server/) |
| **Just the infrastructure** (no `/me`, no global guard, no controllers) | `@bitwild/rockets-core` | [`packages/rockets-core/`](./packages/rockets-core/) |

Don't know which? [`docs/reference/packages.md`](./docs/reference/packages.md)
has the one-page decision matrix.

---

## How-to guides

The most common cookbook recipes:

- [**Add a CRUD resource**](./docs/how-to/crud/declare-a-resource.md) —
  `defineResource()` end-to-end
- [**Add a non-CRUD feature**](./docs/how-to/persistence/add-an-entity.md) —
  `defineModuleResource()` for entity + Nest wiring
- [**Add cross-resource relations**](./docs/how-to/crud/add-relations.md) —
  type-safe `relation()` between bundles
- **Owner-scoped resource:**
  [link](./docs/how-to/access-control/owner-scoped-resource.md) —
  `OwnerScopeHook` for per-user filtering
- [**Add a JWT strategy**](./docs/how-to/auth/add-jwt-strategy.md) —
  implement `AuthAdapterInterface`
- [**Invite a user**](./docs/how-to/auth/invite-user.md) —
  admin invitation flow with email
- [**Add an ACL rule**](./docs/how-to/access-control/add-an-acl-rule.md) —
  RBAC rules + AC service
- **Swap TypeORM for Firestore:**
  [link](./docs/how-to/persistence/swap-typeorm-for-firestore.md) —
  at the root or per-entity
- **Override one step of a handler:**
  [link](./packages/rockets-server-auth/README.md#how-to-override-one-step-of-a-handler-eg-log-every-signup)
  — `AbstractSignupUserHandler` extension
- **Append decorators to a built-in route:**
  [link](./packages/rockets-server-auth/README.md#how-to-append-decorators-to-a-built-in-route-eg-throttling)
  — controller extras

Full how-to index: [`docs/how-to/`](./docs/how-to/).

---

## Reference

Authoritative facts about every API and configuration option.

- **Package decision matrix:** [`docs/reference/packages.md`](./docs/reference/packages.md)
- **`RocketsAuthModule` configuration:** [`docs/reference/configuration.md`](./docs/reference/configuration.md)
- **Handler seams (8-step contract):** [`docs/reference/handler-seams.md`](./docs/reference/handler-seams.md)
- **Controller extras (decorators + hooks):** [`docs/reference/controller-extras.md`](./docs/reference/controller-extras.md)
- **`AuthAdapterInterface` + port services:** [`docs/reference/port-services.md`](./docs/reference/port-services.md)
- **Decorators (`@AuthPublic`, `@AuthUser`):** [`docs/reference/decorators.md`](./docs/reference/decorators.md)
- **Exception catalogue:** [`docs/reference/exceptions.md`](./docs/reference/exceptions.md)
- **API endpoints (all packages):** [`docs/reference/api-endpoints.md`](./docs/reference/api-endpoints.md)
- **Upstream version matrix:** [`docs/reference/upstream-versions.md`](./docs/reference/upstream-versions.md)

Each package README also has a **Reference** section with its own API
surface:

- [`@bitwild/rockets-core`](./packages/rockets-core/README.md#reference)
- [`@bitwild/rockets`](./packages/rockets-server/README.md#reference)
- [`@bitwild/rockets-auth`](./packages/rockets-server-auth/README.md#reference)

---

## Explanation

Rationale for the design — read these when you want to know *why* the
codebase looks the way it does.

- **Architecture flow diagram:**
  [`docs/diagrams/rockets-architecture-flow.md`](./docs/diagrams/rockets-architecture-flow.md)
  — built-in vs external paths
- **Initiative & boundaries:**
  [`docs/explanation/rockets-initiative.md`](./docs/explanation/rockets-initiative.md)
  — what's in scope, what's deliberately out
- **Layer architecture:**
  [`docs/explanation/architecture.md`](./docs/explanation/architecture.md)
  — why core has no controllers
- **Persistence is database-agnostic:**
  [`docs/explanation/adr/0002-database-agnostic-repository.md`](./docs/explanation/adr/0002-database-agnostic-repository.md)
  — `RepositoryInterface` as the contract
- **Auth-persistence asymmetry:**
  [`docs/explanation/adr/0003-auth-persistence-asymmetry.md`](./docs/explanation/adr/0003-auth-persistence-asymmetry.md)
  — why `RocketsAuthModule` keeps its own `repositoryPersistence` shape
- **DDD per domain:**
  [`docs/explanation/ddd-clean-arch.md`](./docs/explanation/ddd-clean-arch.md)
  — domain/application/infrastructure layout in `rockets-server-auth`
- **7 override seams:**
  [`docs/explanation/7-override-seams.md`](./docs/explanation/7-override-seams.md)
  — every customisation surface in one map
- **Default security posture:**
  [`docs/explanation/security-posture.md`](./docs/explanation/security-posture.md)
  — JWT / OTP / brute-force defaults
- **Upstream gaps:**
  [`docs/explanation/upstream-gaps.md`](./docs/explanation/upstream-gaps.md)
  — what's blocked on `@concepta/nestjs-*` v8 and why

For AI agents: [`docs/ai/llms.txt`](./docs/ai/llms.txt) is a
machine-friendly TOC following [llmstxt.org](https://llmstxt.org/).

---

## Repository layout

| Directory | Contents | README |
|---|---|---|
| `packages/rockets-core/` | Auth abstraction, CQRS wiring, declarative resources, Swagger registration | [README](./packages/rockets-core/README.md) |
| `packages/rockets-server/` | Composition root for **external** auth (`/me` endpoint + guard) | [README](./packages/rockets-server/README.md) |
| `packages/rockets-server-auth/` | Full self-hosted auth: JWT, signup, login, recovery, OTP, invitations, admin | [README](./packages/rockets-server-auth/README.md) |
| `packages/rockets-common/` | Shared utilities, hooks, Swagger UI re-export | — |
| `packages/rockets-repository/` | Abstract data access (no ORM in the type layer) | — |
| `packages/rockets-crud/` | Generic CRUD module | — |
| `packages/rockets-access-control/` | ACL/RBAC primitives | — |
| `examples/sample-server-auth/` | End-to-end app using `rockets-auth` (built-in auth + RBAC + invitations) | [README](./examples/sample-server-auth/README.md) |
| `examples/sample-server/` | End-to-end app using `rockets` (BYO auth + multi-pattern CRUD catalogue) | [README](./examples/sample-server/README.md) |

Documentation follows the [Diátaxis](https://diataxis.fr/) framework
under [`docs/`](./docs/) — tutorials, how-to guides, reference,
explanation. Each package README is self-contained and follows the
same four-section shape.

---

## Status

The repo is on `feature/version8`: migration from `@concepta/nestjs-*`
v7 to v8 is complete for the auth-side packages. A few transitive deps
stay v7 until upstream ships v8 (OAuth providers, access-control,
email, event, swagger-ui). See
[`docs/reference/upstream-versions.md`](./docs/reference/upstream-versions.md)
for the current matrix and
[`docs/explanation/upstream-gaps.md`](./docs/explanation/upstream-gaps.md)
for what's blocked and why.

---

## Contributing

The contributor docs live in [`docs/contributing/`](./docs/contributing/).
Repository-level conventions (file layout, override patterns, testing
policy) are in [`AGENTS.md`](./AGENTS.md). Open an issue describing the
change before opening a PR.

---

## Security

Found a vulnerability? **Do not open a public issue.** Email
**<security@bitwild.com>** — see [`SECURITY.md`](./SECURITY.md) for the
disclosure timeline. The default security posture (JWT / OTP /
brute-force) is documented in
[`docs/explanation/security-posture.md`](./docs/explanation/security-posture.md).

---

## License

MIT — see [`LICENSE.txt`](./LICENSE.txt).
