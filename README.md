# Rockets

![Rockets Logo](https://raw.githubusercontent.com/conceptadev/rockets/main/assets/rockets-icon.svg)

[![CI](https://img.shields.io/github/actions/workflow/status/conceptadev/rockets/ci-merge.yml?branch=main&label=CI)](https://github.com/conceptadev/rockets/actions/workflows/ci-merge.yml)
[![Codecov](https://codecov.io/gh/conceptadev/rockets/branch/main/graph/badge.svg)](https://codecov.io/gh/conceptadev/rockets)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-green.svg)](LICENSE.txt)

> Configuration-driven NestJS stack. One options object becomes a working API —
> auth, dynamic repositories, generated CRUD controllers, hooks, swagger.

**Status:** pre-1.0. Public package manifests are aligned at `1.0.0-alpha.8`,
and the release gates are in place; registry publication and the `alpha`
dist-tag update are still pending. The public
surface (`AuthAdapterInterface`, `defineResource`, `defineModuleResource`,
`defineOperationResource` / `operationResource`,
`RepositoryInterface`, `createServer`) may still change before 1.0. Pin exact
versions in production.

## Table of contents

- [1. Introduction](#1-introduction)
- [What problem each layer solves](#what-problem-each-layer-solves)
- [The two paths](#the-two-paths)
  - [Stargate, micro apps, and shared auth](#stargate-micro-apps-and-shared-auth)
  - [The three contracts](#the-three-contracts)
  - [What you do NOT need to write](#what-you-do-not-need-to-write)
  - [What you still write](#what-you-still-write)
- [2. Get Started](#2-get-started)
- [Prerequisites](#prerequisites)
  - [Path A — External auth](#path-a--external-auth-minimal-app-30-lines)
  - [Path B — Built-in auth](#path-b--built-in-auth-full-user-system)
- [3. How-to Guides](#3-how-to-guides)
  - [Run multiple auth credentials (chain)](#run-multiple-auth-credentials-chain)
  - [Mark a route as public](#mark-a-route-as-public)
  - [Add a non-CRUD feature](#add-a-non-crud-feature-controller--service--entity)
  - [Add typed non-CRUD endpoints](#add-typed-non-crud-endpoints-operationresource)
  - [Add a nested CRUD resource](#add-a-nested-crud-resource-petspetidtags)
  - [Wire TypeORM without hand-registering entities](#wire-typeorm-without-hand-registering-entities)
  - [Mix two persistence adapters](#mix-two-persistence-adapters)
  - [Scope rows to the authenticated user](#scope-rows-to-the-authenticated-user)
  - [Read the authenticated user inside a CRUD handler](#read-the-authenticated-user-inside-a-crud-handler)
  - [Add role-based access control](#add-role-based-access-control)
  - [Disable the global guard or the `/me` controller](#disable-the-global-guard-or-the-me-controller)
  - [Override a default user-metadata handler](#override-a-default-user-metadata-handler)
  - [Troubleshooting](#troubleshooting)
- [4. Reference](#4-reference)
  - [Engine (upstream `@concepta/nestjs-*`)](#engine-upstream-conceptanestjs-)
  - [Upstream contributors and integration scope](#upstream-contributors-and-integration-scope)
  - [Package matrix](#package-matrix)
  - [Repository layout](#repository-layout)
  - [Versions](#versions)
  - [Common scripts](#common-scripts-from-the-monorepo-root)
- [Final Review Checklist](#final-review-checklist)
- [5. Contributing](#5-contributing)
- [6. Security](#6-security)
- [7. License](#7-license)

---

## 1. Introduction

Rockets removes the part of a NestJS backend that you write the same way every
time: an auth guard, an entity-to-controller pipeline, validation wiring,
swagger annotations, owner scoping, repository plumbing. You describe each
feature once as a config object, and the framework registers the modules,
providers, controllers, and routes for you.

There is **no codegen step**. Everything happens at runtime through Nest dynamic
modules. Adding a feature means appending an object to a `resources[]` array.

**Engine vs composition:** the **motor** is the upstream `@concepta/nestjs-*`
stack (repository, CRUD, hooks, access control, and — on path B — user/role/otp
modules). `@concepta/rockets-*` packages are mostly **curated re-exports plus
wiring**: `@concepta/rockets-core` runs `buildAppRegistrationPlan` and turns your
`resources[]` / `repository` / `auth` options into Nest imports that call those
upstream modules. Rockets does not replace that stack; it centralises
configuration. See [Engine (upstream)](#engine-upstream-conceptanestjs-) in
Reference.

### What problem each layer solves

Be explicit about **who owns which problem** — Rockets is not one monolith.

| Layer                          | Package(s)                                                                        | Problem it solves                                                                                                                                                                                                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Motor**                      | `@concepta/nestjs-*` (re-exported through `@concepta/rockets-core`)                | Reimplementing repository access, CRUD shape, hooks, and ACL primitives on every NestJS project.                                                                                                                                                                                  |
| **Composition**                | `@concepta/rockets-core`                                                           | Manually stitching Nest modules, entity registration, guard + adapter chain, and swagger for every new service — even when you already use Concepta motors.                                                                                                                       |
| **Path A — external identity** | `@concepta/rockets`                                                                | **Micro app runtime** — shared guard, `/me`, auth chain, declarative `resources[]`. Users live outside the app (Firebase, Auth0, central JWT). Primary choice for Stargate-provisioned workflow APIs. See [packages/rockets-server/README.md](packages/rockets-server/README.md). |
| **Path B — built-in identity** | `@concepta/rockets-auth`                                                           | The app **is** the user system (signup, login, OTP, roles, invitations) and you do not want to wire seven Concepta identity modules yourself.                                                                                                                                     |

**Honest scope:** Rockets removes repeated **infrastructure** work on new
backends (auth wiring, CRUD registration, persistence plumbing). Most calendar
time on a real product is still domain logic, integrations, and operations — not
something any framework eliminates.

### The two paths

There are two ways to run a Rockets app, and the choice depends on **where your
users live**.

**Path A — External auth** (`@concepta/rockets`). You bring an
`AuthAdapterInterface` implementation. The framework gives you `/me`, a global
guard, generated CRUD, hooks, swagger. Pick this when users live in Firebase,
Auth0, a custom JWT issuer, or any other identity store.

**Path B — Built-in auth** (`@concepta/rockets-auth`). The framework owns the
user table. You get signup, login, password recovery, OTP, invitations, admin
user CRUD, role-based access control — all wired through one
`defineRocketsAuth()` call. Pick this when the app is the identity source.

The two paths share the same lower layers (resource planner, dynamic repository,
hooks, swagger), so a feature added to one runs identically on the other.

#### Stargate, micro apps, and shared auth

Enterprise shape: **Stargate** (workflow platform, n8n-like) connects systems
and provisions **micro apps**; each micro app is a small Nest API on
**`@concepta/rockets`** with **one shared identity** across the product.

| Piece                  | Role                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Stargate**           | Design cross-system workflows, call micro apps over HTTP, register URLs — orchestration, not domain CRUD            |
| **Identity (once)**    | Firebase / Okta / one `@concepta/rockets-auth` deployment — login, tokens, shared **user id**                        |
| **Micro app**          | `@concepta/rockets` — global guard, `/me`, `userMetadata`, `resources[]` for one domain (billing, CRM, code review…) |
| **Stargate workflow**  | Automation in Stargate (webhook → transform → call API → notify)                                                    |
| **Micro app workflow** | Business rules inside the API (hooks, services, CQRS)                                                               |

```text
  Users / integrators
         │
         ▼
  ┌──────────────┐     HTTP / provision     ┌──────────────────────────┐
  │   Stargate   │ ───────────────────────▶│  Micro apps (Rockets)    │
  │  (workflows) │                           │  Billing · CRM · Review  │
  └──────────────┘                           └────────────┬─────────────┘
         │                                                  │
         ▼                                                  ▼
  External systems                              ┌──────────────────────────┐
  (email, CRM, webhooks)                        │  Identity (once)         │
                                                │  same token · same user  │
                                                └──────────────────────────┘
```

##### Do

- One issuer (IdP or central `rockets-auth`); every micro app uses an
  `AuthBootstrap` pointing at the **same** project/secret so `AuthorizedUser.id`
  matches everywhere.
- Same `userMetadata` contract in each micro app (profile row keyed by auth id,
  exposed on `/me`).
- Each squad owns only `repository` + `resources[]` for its domain (optional
  Firestore override per entity).

##### Do not

- Scaffold `defineRocketsAuth()` with a separate user DB in every
  Stargate-generated micro app — breaks SSO.
- Treat Stargate as the token issuer unless it actually is; micro apps must
  trust the real identity layer.
- Put domain persistence and CRUD inside Stargate — Stargate orchestrates; micro
  apps execute.

| Deployment                | Identity (once)                              | Micro apps (many)                                                     |
| ------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| **Path A — external IdP** | Firebase / Auth0 / Okta                      | `@concepta/rockets` — adapter validates IdP token; user id = IdP `sub` |
| **Path B — built-in**     | `@concepta/rockets-auth` (signup, login, JWT) | `@concepta/rockets` — same JWT; user id = your user row                |

**Multiple adapters** in `auth: [...]` are supported when each credential
resolves to the **same** `AuthorizedUser.id` (e.g. Firebase for users + API key
for automation — see [sample-code-review](examples/sample-code-review)).

See also
[Run multiple auth credentials (chain)](#run-multiple-auth-credentials-chain)
and [Mix two persistence adapters](#mix-two-persistence-adapters).

### The three contracts

The whole system rests on three TypeScript interfaces. Everything else is a
default or a convenience built on top.

**`AuthAdapterInterface`** — the only thing the framework asks of your
authentication.

```typescript
interface AuthAdapterInterface {
  authenticate(request: AuthRequest): Promise<AuthAttemptResult>;
}

type AuthAttemptResult =
  | { matched: false } // not this adapter's credential
  | { matched: true; user: AuthorizedUser } // recognised and validated
  | { matched: true; error: HttpException }; // recognised but rejected

interface AuthorizedUser {
  id: string;
  sub: string;
  email?: string;
  userRoles?: { role: { name: string } }[]; // drives RBAC
  claims?: Record<string, unknown>; // free-form IdP payload
}
```

`AuthServerGuard` iterates a chain of adapters. `matched: false` means "try the
next adapter". `matched: true; user` stops the chain. `matched: true; error`
stops the chain and throws — no surprising credential passthrough.

**`RepositoryInterface<T>`** — the only thing the framework asks of your
persistence.

The contract lives in `@concepta/nestjs-repository` (import via
`@concepta/rockets-core`). Adapters that satisfy it: TypeORM
(`@concepta/rockets-repository-typeorm`), Firestore
(`@concepta/rockets-repository-firestore`), any custom adapter you write. Domain
code uses `@InjectDynamicRepository(EntityClass)` and
`RepositoryInterface<EntityClass>` — never `@InjectRepository`. The same handler
runs against any adapter.

**`ResourceInput`** — the configuration shape that becomes a feature.

```typescript
type ResourceInput =
  | RocketsResourceConfig // hand-built CRUD config
  | ReturnType<typeof defineResource> // CRUD with auto-defaults
  | ReturnType<typeof defineModuleResource> // non-CRUD Nest slice
  | ReturnType<typeof defineSubResource> // nested CRUD
  | ReturnType<typeof defineOperationResource> // typed non-CRUD endpoints
  | ReturnType<typeof operationResource>; // zod-first operationResource
```

`buildAppRegistrationPlan({ resourceDefinitions, repository, userMetadata })`
walks the list, collects entities per adapter, materialises CrudModule features,
and emits the final Nest module composition. This is where the "one options
object" becomes Nest modules.

### What you do NOT need to write

A NestJS backend started from scratch needs all of the following — Rockets ships
them:

- A JWT guard and `/me` route (path A) or a complete authentication module (path
  B).
- A list / read / create / update / delete controller per entity, with DTO
  validation and swagger schemas.
- Typed RPC-style controllers for actions that are not CRUD (via
  `operationResource`).
- TypeORM (or Firestore) module registration with the entity list — replaced by
  the planner deriving the list from `resources[]`.
- An owner-scoping hook so user A doesn't read user B's rows.
- A consistent error filter, a uniform `RepositoryInterface`, transaction
  primitives.
- The wiring that connects all of the above.

### What you still write

Your business logic, your DTOs, your entity classes, your custom hooks, your
access-control rules. Rockets does not pretend to write those for you.

---

## 2. Get Started

### Prerequisites

- Node 20.19+ — the published packages are CommonJS and `require()` the ESM
  `@nestjs/*` 12 / `@concepta/nestjs-*` 8 line, which needs Node's
  `require(esm)` (20.19+ / 22.12+).
- A package manager (yarn 4 / npm / pnpm — examples below use yarn).
- A database adapter — TypeORM with any supported driver is the most common.
  Firestore works via `@concepta/rockets-repository-firestore`.

### Installing from GitHub (pre-release)

While the current layout stabilises, consume the packages straight from
this repository instead of npm. With yarn 4, a git dependency can target a
single workspace of the monorepo (each package builds itself on install via
its `prepack` script):

```bash
yarn add @concepta/rockets@git@github.com:conceptadev/rockets.git#workspace=@concepta/rockets
```

One caveat: at pack time yarn rewrites the internal `workspace:^` ranges to
`^1.0.0-alpha.8`. Until that version is published, force every
`@concepta/*` package to the same git commit with `resolutions` in the
consuming app:

```json
{
  "resolutions": {
    "@concepta/rockets": "conceptadev/rockets#workspace=@concepta/rockets&commit=<sha>",
    "@concepta/rockets-core": "conceptadev/rockets#workspace=@concepta/rockets-core&commit=<sha>",
    "@concepta/rockets-repository-typeorm": "conceptadev/rockets#workspace=@concepta/rockets-repository-typeorm&commit=<sha>"
  }
}
```

Pin `&commit=<sha>` (or `#<branch>` while iterating) so installs stay
reproducible. For day-to-day development inside this repo, the examples
already consume the workspaces directly — nothing to configure.

### Path A — External auth (minimal app, ~30 lines)

Registry install (after `1.0.0-alpha.8` is published; until then use the GitHub
instructions above):

```bash
yarn add @concepta/rockets@alpha \
  @concepta/rockets-repository-typeorm@alpha typeorm @nestjs/typeorm sqlite3 \
  reflect-metadata rxjs
```

**What installs automatically** when you add `@concepta/rockets@alpha`
(transitive `dependencies`):

| Pulled in for you      | Packages                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Other `@concepta/*`     | `rockets-core`                                                                                                        |
| Upstream motor         | `@concepta/nestjs-{core,repository,crud,authentication,access-control}` (via `@concepta/rockets-core` re-exports)      |
| Nest (Rockets runtime) | `@nestjs/common`, `@nestjs/core`, `@nestjs/cqrs`, `@nestjs/swagger`                                                   |
| Schema engine          | `zod` — a dependency of `@concepta/rockets-core`; the `@concepta/rockets-core/zod` subpath needs nothing extra        |

Optional add-ons (install when you need them):

| Package                                                                             | When                                   |
| ----------------------------------------------------------------------------------- | -------------------------------------- |
| `@concepta/rockets-adapter-firebase`                                                 | Firebase ID tokens                     |
| `@concepta/rockets-repository-firestore`                                             | Firestore persistence                  |
| `@concepta/rockets-auth@alpha`                                                       | Built-in signup/login (Path B)         |

**What you still add explicitly** (and why):

| Package                                                                                        | Why not transitive                                                                                                                          |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `@concepta/rockets-repository-typeorm`, `typeorm`, `@nestjs/typeorm`, driver (`sqlite3`, `pg`, …) | Persistence adapter is an **app choice** — `typeorm` and the driver are peers/app deps; Firestore-only apps use the Firestore adapter instead |
| `rxjs`, `reflect-metadata`                                                                     | **peerDependencies** of Rockets / Nest — npm/yarn expect the host Nest app to provide them (install peers or enable your package manager’s peer auto-install). `class-validator` / `class-transformer` are no longer required: every wire shape is a zod schema |

Add `@concepta/rockets-core` **only** if you import symbols from that package
path in app code (e.g. `OwnerStampHook` from `@concepta/rockets-core`). If
everything comes from `@concepta/rockets` re-exports, you do not need duplicate
`@concepta/*` lines.

Write an adapter (the only auth code you own):

```typescript
// src/auth/jwt.adapter.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
  defineAuthAdapter,
  extractBearerToken,
} from '@concepta/rockets';

@Injectable()
export class JwtAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    try {
      const payload = verify(token, process.env.JWT_SECRET!) as {
        sub: string;
        email?: string;
      };
      return {
        matched: true,
        user: { id: payload.sub, sub: payload.sub, email: payload.email },
      };
    } catch {
      return { matched: true, error: new UnauthorizedException() };
    }
  }
}

export const jwtAuth = defineAuthAdapter(JwtAdapter);
```

Declare a resource — this is the entire CRUD definition:

```typescript
// src/pet/pet.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('pet')
export class PetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() userId!: string;
  @Column() name!: string;
  @Column() species!: string;
}
```

Create the TypeORM bootstrap at the boundary. The adapter owns the wrapper, so
applications do not copy infrastructure helpers:

```typescript
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';

const repository = defineTypeOrmRepository({
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
  dropSchema: true,
});
```

**Why this exists:** you pass only connection options (`type`, `database`,
`synchronize`, …). You never maintain
`entities: [PetEntity, UserMetadataEntity, …]` on `TypeOrmModule.forRoot`. When
the server boots, the registration planner walks `resources[]`,
`userMetadata.entity`, and any entities contributed by auth integrations, then
calls `forRoot(mergedEntities)` once and `forFeature` per table. Services use
`@InjectDynamicRepository(PetEntity)` and get a `RepositoryInterface<PetEntity>`
— registration is automatic as long as the entity appeared in that plan.

Compose the app:

```typescript
// src/server.ts
import { NestFactory } from '@nestjs/core';
import { createServer, defineResource } from '@concepta/rockets';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';
import { OwnerStampHook, OwnerScopeHook } from '@concepta/rockets-core';
import { jwtAuth } from './auth/jwt.adapter';
import { PetEntity } from './pet/pet.entity';
// defineUserMetadata(userMetadataSchema) → { entity, updateSchema, responseSchema }
// (see CONFIGURATION.md §9)
import { userMetadataConfig } from './user/user-metadata.schema';

const repository = defineTypeOrmRepository({
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
  dropSchema: true,
});

export const server = createServer({
  auth: jwtAuth,
  userMetadata: userMetadataConfig,
  repository,
  resources: [
    defineResource({
      entity: PetEntity,
      hooks: [OwnerStampHook.for(PetEntity), OwnerScopeHook.for(PetEntity)],
    }),
  ],
});

const app = await NestFactory.create(server);
await app.listen(3000);
```

Run it:

```bash
yarn nest start
# GET    /me              (built from userMetadata config, returns user + userMetadata)
# PATCH  /me              (validates body.userMetadata against updateSchema, upserts)
# GET    /pets            (owner-scoped list)
# POST   /pets            (auto-stamps userId)
# GET    /pets/:id        (owner-scoped read)
# PATCH  /pets/:id        (owner-scoped update)
# DELETE /pets/:id        (owner-scoped delete)
# Swagger at /api
```

You wrote one adapter, one entity, one resource definition. The controllers, the
validation pipeline, the global guard, the swagger document, the JWT route
protection, and the owner scoping are all framework.

### Path B — Built-in auth (full user system)

Install the same packages as above plus `@concepta/rockets-auth` and the upstream
`@concepta/nestjs-*` line (most are transitive dependencies; `yarn install` will
pull them).

Compose with `defineRocketsAuth()`. Give it the TypeORM bootstrap once; the
integration contributes its auth rows, root repository, metadata contract, and
guard preference to the surrounding server:

```typescript
import { Module } from '@nestjs/common';
import { defineRocketsAuth, rocketsAuthRoleSchema } from '@concepta/rockets-auth';
import { RocketsModule } from '@concepta/rockets';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';

const repo = defineTypeOrmRepository({
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
  dropSchema: true,
});

const rocketsAuthInput = {
  persistence: {
    module: repo,
    entities: {
      user: UserEntity,
      userCredentials: UserCredentialEntity,
      userOtp: UserOtpEntity,
      role: RoleEntity,
      userRole: UserRoleEntity,
      federatedIdentity: FederatedEntity,
    },
  },
  invitationEntity: InvitationEntity,
  userMetadata: { entity: UserMetadataEntity, updateSchema, responseSchema },
  userCrud: {}, // model / dto derived from the userMetadata schemas
  roleCrud: { model: rocketsAuthRoleSchema },
  useFactory: () => ({
    services: { mailerService },
    authentication: {
      ports: {
        recoveryNotification: {
          /* command classes */
        },
        verifyNotification: {
          /* command classes */
        },
      },
    },
    settings: {
      /* role names, otp config, email templates */
    },
  }),
};

@Module({
  imports: [
    RocketsModule.forRoot({
      auth: defineRocketsAuth(rocketsAuthInput),
      resources: [/* your application defineResource bundles */],
    }),
  ],
})
export class AppModule {}
```

You now get `POST /signup`, `POST /token/password`, `POST /token/refresh`,
`PATCH /me/password`, OTP flow, password recovery, admin user / role CRUD,
invitation flow — plus everything path A gives you.

The monorepo ships runnable sample apps for both paths (`yarn sample:dev` and
`yarn sample-auth:dev` from the repo root).

---

## 3. How-to Guides

### Run multiple auth credentials (chain)

`auth` accepts a single `AuthBootstrap` or an array. Each entry is one of:

- `defineFirebaseAuth({ firebaseApp })` or the explicit `{ forRootAsync }`
  variant — Firebase Admin +
  `FirebaseAuthAdapter` (`@concepta/rockets-adapter-firebase`).
- `defineRocketsAuth(...)` — complete built-in signup/login stack and its owned
  persistence contributions (`@concepta/rockets-auth`).
- `defineAuthAdapter(Adapter, options?)` — complete host wiring for a custom
  adapter (see
  `defineApiKeyAuth()` in sample-code-review).

Explicit server options override integration-contributed defaults. Conflicting
defaults from two integrations fail at startup instead of depending on order.

```typescript
import { defineFirebaseAuth } from '@concepta/rockets-adapter-firebase';
import { defineModuleResource } from '@concepta/rockets-core';
import { RocketsModule } from '@concepta/rockets';

import { defineApiKeyAuth, apiKeyAuthResource } from './auth-api-key';
import { UserEntity } from './auth/user.entity';

RocketsModule.forRoot({
  auth: [
    defineFirebaseAuth({
      forRootAsync: { useFactory: resolveFirebaseAuthModuleOptions },
    }),
    defineApiKeyAuth(),
  ],
  userMetadata: { entity, updateSchema, responseSchema },
  repository,
  resources: [
    defineModuleResource({ entities: [UserEntity] }),
    apiKeyAuthResource,
  ],
});
```

The guard iterates in order. The first adapter that returns `matched: true`
wins. If it returns `matched: true; error`, the chain stops and the error is
thrown.

### Mark a route as public

```typescript
import { AuthPublic } from '@concepta/rockets';

@Controller('health')
export class HealthController {
  @Get() @AuthPublic() ok() {
    return { status: 'ok' };
  }
}
```

`AuthServerGuard` skips routes tagged with `@AuthPublic`. To skip the guard
wholesale, pass `enableGlobalGuard: false` to `RocketsModule.forRoot`.

### Add a non-CRUD feature (controller + service + entity)

`defineModuleResource` is the escape hatch when you want CRUD generation off and
full Nest control on.

```typescript
import { defineModuleResource } from '@concepta/rockets';

const billingFeature = defineModuleResource({
  entities: [InvoiceEntity],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService], // exported = globally injectable
});
```

`RocketsCoreModule` is global, so anything in `exports` is reachable from every
other module — including the outer `RocketsModule.forRootAsync` factory's
`inject:` list. Export the minimum to avoid name collisions.

### Add typed non-CRUD endpoints (`operationResource`)

Use when you need RPC-style routes (health, actions, reports) **without** a
hand-written Nest controller. Prefer the zod helper from
`@concepta/rockets-core/zod` (not re-exported on the `@concepta/rockets`
facade today):

```typescript
import { operationResource } from '@concepta/rockets-core/zod';
import { z } from 'zod';

export const ops = operationResource({
  path: 'ops',
  public: true,
  operations: (op) => ({
    ping: op.read({
      path: '', // GET /ops — default path is the operation key
      output: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: true }),
    }),
    shout: op.write({
      input: z.object({ text: z.string().min(1) }),
      output: z.object({ text: z.string() }),
      handler: ({ input }) => ({ text: input.text.toUpperCase() }),
    }),
  }),
});
```

Rules that matter: **`output` is required** (schema or `output: false`);
`operations` is a callback (`op.read` / `op.write` / `op.delete`); optional
resource `params: z.object(...)` validates path params (400); cross-resource
route collisions fail at plan time. Full field reference:
[CONFIGURATION.md §6a](CONFIGURATION.md#6a-operationresource--typed-non-crud-endpoints-issue-43--50).
Sample: `examples/sample-server` `POST /pets/:petId/transfer`.

### Add a nested CRUD resource (`/pets/:petId/tags`)

```typescript
import { defineSubResource } from '@concepta/rockets';

const petTagResource = defineSubResource({
  parent: PetEntity,
  parentParam: 'petId',
  parentFk: 'petId',
  entity: PetTagEntity,
});
```

The framework generates `/pets/:petId/tags`, filters by `petId`, and verifies
the caller owns the parent via `PathScopeGuard`.

### Wire TypeORM without hand-registering entities

Import `defineTypeOrmRepository` from
`@concepta/rockets-repository-typeorm`. It implements `RepositoryBootstrap`
and keeps TypeORM connection concerns in the adapter package while core stays
storage-agnostic. Firestore-only apps skip it and use
`@concepta/rockets-repository-firestore` instead.

#### What you declare vs what the framework registers

| You configure                                                                      | Planner collects                           |
| ---------------------------------------------------------------------------------- | ------------------------------------------ |
| `defineResource({ entity: PetEntity })`                                            | `PetEntity` → default `repository` adapter |
| `userMetadata: { entity: UserMetadataEntity, … }`                                  | metadata row                               |
| `defineModuleResource({ entities: [InvoiceEntity], … })`                           | extra tables (CRUD or not)                 |
| `defineRocketsAuth({ persistence: { entities: { user: UserEntity, … } } })`        | auth tables (path B)                       |
| `defineModuleResource({ entities: [{ entity: X, repository: FirestoreModule }] })` | per-entity adapter override                |

**What you write in `app.module.ts`:**

```typescript
const repository = defineTypeOrmRepository({
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
  dropSchema: true,
});

@Module({
  imports: [
    RocketsModule.forRoot({
      repository, // connection only — no entities: [...] here
      userMetadata: { entity: UserMetadataEntity, updateSchema, responseSchema },
      resources: [
        defineResource({ entity: PetEntity }),
        defineModuleResource({
          entities: [InvoiceEntity],
          providers: [BillingService],
        }),
      ],
    }),
  ],
})
export class AppModule {}
```

**What you write in services/handlers** — same for CRUD handlers, custom
services, and access-query services:

```typescript
import { InjectDynamicRepository } from '@concepta/rockets-core';
import type { RepositoryInterface } from '@concepta/rockets-core';

@Injectable()
export class PetModelService {
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly pets: RepositoryInterface<PetEntity>,
  ) {}

  listForUser(userId: string) {
    return this.pets.find({ where: { userId } });
  }
}
```

No `TypeOrmModule.forFeature([PetEntity])` in feature modules. No
`@InjectRepository`. If the entity is in the registration plan,
`@InjectDynamicRepository` resolves at runtime.

**Built-in auth (path B):** pass the repository to `defineRocketsAuth`; its
composition contribution makes the same connection serve app and auth tables:

```typescript
const repository = defineTypeOrmRepository({
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
});

const rocketsAuth = defineRocketsAuth({
  persistence: {
    module: repository,
    entities: { user: UserEntity, role: RoleEntity /* … */ },
  },
  // …
});

@Module({
  imports: [
    RocketsModule.forRoot({
      auth: rocketsAuth,
      resources: [
        /* pet resources — no per-resource persistence block */
      ],
    }),
  ],
})
export class AppModule {}
```

### Mix two persistence adapters

The default adapter goes in `repository:`. Override per entity inside a bundle:

```typescript
import { defineModuleResource } from '@concepta/rockets';
import { defineFirestoreRepository } from '@concepta/rockets-repository-firestore';

const firestoreRepository = defineFirestoreRepository();

defineModuleResource({
  entities: [
    {
      entity: AnalyticsEventEntity,
      repository: firestoreRepository,
      collection: 'analytics_events',
    },
  ],
  providers: [AnalyticsService],
});
```

Everything else stays on the default adapter. The same `RepositoryInterface<T>`
works across both.

Canonical mixed-store example: [sample-code-review](examples/sample-code-review)
(`defineTypeOrmRepository` at root + `defineFirestoreRepository` on report
entities).

### Scope rows to the authenticated user

```typescript
import { defineResource } from '@concepta/rockets';
import { OwnerStampHook, OwnerScopeHook } from '@concepta/rockets-core';

defineResource({
  entity: PetEntity,
  hooks: [
    OwnerStampHook.for(PetEntity), // create/update: stamp userId
    OwnerScopeHook.for(PetEntity), // list/read/update/delete: filter by userId
  ],
});
```

Both default to a `userId` column; pass a second argument to override
(`OwnerStampHook.for(PetEntity, 'ownerId')`). Hooks run at the repository layer,
so direct (non-HTTP) calls are scoped too.

### Read the authenticated user inside a CRUD handler

CRUD-generated controllers don't expose method signatures you can decorate. Use
`getActor` inside the command / query handler:

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import {
  CrudCreateCommand,
  CrudWithBodyCommandHandler,
} from '@concepta/nestjs-crud';
import { getActor } from '@concepta/rockets-core';

@CommandHandler(CrudCreateCommand)
export class PetCreateHandler extends CrudWithBodyCommandHandler {
  async execute(cmd: CrudCreateCommand) {
    const actor = getActor(cmd.context);
    // actor.id, actor.email, actor.userRoles
    return super.execute(cmd);
  }
}
```

In controllers you own, import `@AuthUser()` from `@concepta/rockets-core`
(same decorator the built-in `/me` route uses). `AuthorizedUser` types come from
`@concepta/rockets` or `@concepta/rockets-core`.

### Add role-based access control

The ACL primitives live upstream in `@concepta/nestjs-access-control`. ACL is
**opt-in**: pass the `accessControl` option to `RocketsModule.forRoot` (type
`RocketsAccessControlConfig`, exported from `@concepta/rockets-core`) and core
registers the upstream `AccessControlModule` — guard, grant table, and query
services included. When the option is omitted, no ACL wiring is registered.
Define a grant table, implement `AccessControlServiceInterface` to feed the
guard with user + roles, then decorate routes:

```typescript
import {
  AccessControlReadOne,
  AccessControlServiceInterface,
} from '@concepta/nestjs-access-control';

RocketsModule.forRoot({
  // ...auth, repository, resources
  accessControl: {
    service: new AcService(), // AccessControlServiceInterface
    settings: { rules: APP_ACL },
    // optional: appGuard, appFilter, imports, queryServices (CanAccess)
  },
});

@Controller('pets')
class PetController {
  @Get(':id') @AccessControlReadOne('pet') read() {
    /* ... */
  }
}
```

`AccessControlServiceInterface.getUserRoles()` typically returns
`user.userRoles?.map(ur => ur.role.name) ?? []` — the same shape
`AuthorizedUser.userRoles` carries.

### Disable the global guard or the `/me` controller

```typescript
RocketsModule.forRoot({
  auth,
  userMetadata,
  repository,
  enableGlobalGuard: false,
  disableController: { me: true },
});
```

Useful when an upstream module already registers a global guard, or when your
app provides its own `/me`.

### Override a default user-metadata handler

```typescript
import {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
} from '@concepta/rockets';

class MyUpsertHandler extends AbstractUpsertUserMetadataHandler { /* ... */ }
class MyGetHandler    extends AbstractGetUserMetadataHandler    { /* ... */ }

RocketsModule.forRoot({
  /* ... */,
  handlers: {
    upsertUserMetadata: MyUpsertHandler,
    getUserMetadata:    MyGetHandler,
  },
});
```

The base classes call the dynamic repository against `userMetadata.entity`.
Subclass to add side effects, audit logs, or alternative storage.

### Troubleshooting

| Symptom                                    | Likely cause                                    | Fix                                                                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routes return 401 with no `auth` configured | The default global guard has an empty adapter chain | Configure an adapter, or set `enableGlobalGuard: false` only when the application is intentionally public.                                                                                                          |
| Routes 401 even with a valid token         | Adapter returns `matched: false`                | Read the token: `extractBearerToken(request)` must not be `null`. Check `Authorization: Bearer <token>` header on the request.                                                                                      |
| A request/response is missing from swagger | The schema is not named, or was wrapped before its last `.extend()` / `.strict()` | Wrap LAST with `withOpenApi(schema, 'SomethingDto')`; the document `$ref`s named schemas only. Generated resources name theirs automatically.                                                                   |
| `OwnerScopeHook` doesn't filter            | `HookModule` not registered in DI               | Don't remove `HookModule.forRoot({})` from core's `createCoreImports`; without it, the hook resolver is `undefined` and decorators become silent no-ops.                                                            |
| `definitionTransform` async wiring broken  | Missed merging `defImports`                     | Always `imports: [...defImports, ...createCoreImports(extras)]`. Losing `defImports` silently breaks `RAW_OPTIONS_TOKEN` injection.                                                                                 |
| Two `Logger` / `AuditService` collide      | Two bundles export classes with the same name   | `RocketsCoreModule` is global; everything in a `defineModuleResource` `exports` array is reachable everywhere. Prefix the name (`BillingPriceFormatter`) or use an injection token.                                 |
| Custom hook always returns 500             | Threw a generic `Error` or wrong exception type | Use `@concepta/nestjs-common` domain exceptions (`ModelValidationException`, …) or map in your exception filter. Repository/HTTP hooks run inside upstream hook + CRUD pipeline — see `@concepta/nestjs-hook` docs. |

---

## 4. Reference

### Engine (upstream `@concepta/nestjs-*`)

The **runtime motor** is the Concepta Nest modules
(`@concepta/nestjs-repository`, `@concepta/nestjs-crud`,
`@concepta/nestjs-hook`, `@concepta/nestjs-common`,
`@concepta/nestjs-access-control`, `@concepta/nestjs-authentication`, and the
domain modules used by built-in auth). Those packages own query execution, CRUD
CQRS handlers, hook pipelines, RBAC guards, and — when you opt in —
signup/login/user tables.

Rockets **does not reimplement** that behaviour. It **configures and registers**
it: one `RocketsModule.forRoot({ ... })` object is split by
`buildAppRegistrationPlan` into the upstream `RepositoryModule`, `CrudModule`,
`HookModule`, and related imports your app would otherwise wire by hand.

| Motor                                                                                           | `@concepta/*` import path                                      | Used for                                                              |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `@concepta/nestjs-repository`                                                                   | `@concepta/rockets-core` (re-export)                            | `RepositoryInterface`, dynamic repositories, transactions, repo hooks |
| `@concepta/nestjs-crud`                                                                         | `@concepta/rockets-core` (re-export)                            | Generated controllers, CQRS commands/queries, default handlers        |
| `@concepta/nestjs-core`, `@concepta/nestjs-authentication`                                      | `@concepta/rockets-core`                                        | Hook resolution (`CoreModule`), shared exceptions, auth primitives    |
| `@concepta/nestjs-access-control`                                                               | opt-in `accessControl` option (import symbols from upstream)   | Grant table, `AccessControlGuard`, route decorators                   |
| `@concepta/nestjs-repository-typeorm`                                                           | `@concepta/rockets-repository-typeorm`                         | SQL adapter plus `defineTypeOrmRepository`, which supplies connection options and accepts the planner-derived entity list |
| `@concepta/nestjs-user`, `role`, `otp`, `password`, `invitation`, `federated`, `email`, `event` | wired inside `@concepta/rockets-auth`                           | Built-in auth HTTP + persistence rows (path B only)                   |

| Rockets layer               | Role                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `@concepta/rockets-core`     | **Planner and contracts**: `defineResource`, `buildAppRegistrationPlan`, `AuthServerGuard`, owner/path hooks, swagger registration |
| `@concepta/rockets` (server) | **External-auth presentation**: the `/me` routes (`buildMeController`), default `APP_GUARD`, `auth` chain merge                    |
| `@concepta/rockets-auth`     | **Built-in identity bundle**: `defineRocketsAuth()` with owned composition contributions                                          |

**Path B uses both** `@concepta/rockets` and `@concepta/rockets-auth`:
`defineRocketsAuth()` supplies the auth bootstrap plus its persistence,
metadata, and guard defaults; `createServer({ auth, resources })` (or the
lower-level `RocketsModule.forRoot`) still comes from the server package. They
are sibling packages over core, not parent/child.

**Repository injection (upstream contract, Rockets-local decorator):**

- **Recommended:** `@InjectDynamicRepository(UserEntity)` — key derived via
  `deriveEntityKey()` so it matches `defineResource({ entity: UserEntity })`.
- **Escape hatch:** `@InjectDynamicRepository('billing/invoice')` when the
  registration key is namespaced or does not follow the entity class name
  (overrides, legacy schemas).

**Override a default CRUD handler:** set `operations.<op>.commandHandler` or
`queryHandler` on the resource config — upstream `CrudModule` uses your class
instead of the default; the defaults exist for convenience only.

### Upstream contributors and integration scope

If you maintain `@concepta/nestjs-*` modules, Rockets is a **consumer and
configuration façade** — not a fork.

| Topic                           | Current decision                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Your modules stay the motor** | `RepositoryInterface`, `CrudModule`, `HookModule`, RBAC, and identity domains are unchanged upstream; Rockets calls them through `buildAppRegistrationPlan`.                                                                                                                                                                                                                                    |
| **What Rockets owns**           | `defineResource`, `defineModuleResource`, `defineSubResource`, `defineOperationResource` / `operationResource`, `AuthAdapterInterface` + guard chain, `RepositoryBootstrap`, swagger registration, `/me` (server), `defineRocketsAuth()` (auth bundle).                                                                                                                                                                                                               |
| **Core re-exports (former `@concepta/rockets-common`)** | `@concepta/rockets-common` was deleted; its helpers (`AuthUser`, `InjectDynamicRepository`, `SwaggerUiModule`, `deriveEntityKey`, …) and upstream re-exports now live inside `@concepta/rockets-core`. This is **not** a replacement for the upstream **app-module** composition pattern — that wiring still lives in Concepta; Rockets adds a **second** entry point (`RocketsModule.forRoot`) that feeds the same motors. |
| **Port backlog (server path)**  | On v8 today: `core`, `repository`, `crud`, `hook`, `common`, `authentication`, `access-control`. Still on v7 in this monorepo: `swagger-ui` (and `email` / `event` on the auth path) — version-mismatched intentionally and tested in CI.                                                                                                                                                                          |
| **Repo migration**              | Moving all of `nestjs-modules` into this git repo is **optional** for product validation. Shipping fixes against published `@concepta/*` alphas is fine; monorepo colocation is for AI context and version lock, not a prerequisite to use Rockets.                                                                                                                                             |
| **Safe to keep building on**    | These are intentional, tested surfaces — not throwaway experiments: `createServer`, `AuthAdapterInterface.authenticate`, `RepositoryInterface` + dynamic repository keys (class **or** string token), `defineResource` / `operationResource` / planner-driven entity registration, and complete `defineRocketsAuth({ persistence })` contributions.                                   |

**Custom validation / business rules:** use `defineHook` from
`@concepta/rockets-core` for simple entity lifecycle rules, upstream
`@concepta/nestjs-hook` (`Spec`, `UseHooks`, repository hooks) for class-based
hooks, or replace a CRUD operation handler. Throw domain exceptions from
`@concepta/nestjs-common` (`ModelValidationException`, etc.) so filters map them
to 4xx — a bare `Error` in a hook often surfaces as 500.

### Package matrix

| Package                                 | npm name                                | Purpose                                                                                                                                                                                                                            | Docs                                                      | Status  |
| --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ------- |
| `packages/rockets-core`                 | `@concepta/rockets-core`                 | Composition planner. Auth chain, `buildAppRegistrationPlan`, `defineResource` / `defineModuleResource` / `defineSubResource` / `defineOperationResource`, `defineHook`, owner/path hooks, swagger registration, shared helpers, zod layer at `@concepta/rockets-core/zod` (`zodResource`, `operationResource`, …), opt-in `accessControl`. | [README](packages/rockets-core/README.md)                 | preview |
| `packages/rockets-repository-typeorm`   | `@concepta/rockets-repository-typeorm`   | TypeORM adapter and `defineTypeOrmRepository` bootstrap for planner-derived entity registration, plus the zod `SchemaEntityCompiler` at `@concepta/rockets-repository-typeorm/zod`.                                                                                   | [README](packages/rockets-repository-typeorm/README.md)   | preview |
| `packages/rockets-repository-firestore` | `@concepta/rockets-repository-firestore` | Firestore adapter implementing `RepositoryAdapter`. Per-entity opt-in.                                                                                                                                                             | [README](packages/rockets-repository-firestore/README.md) | preview |
| `packages/rockets-adapter-firebase`     | `@concepta/rockets-adapter-firebase`     | Firebase Auth adapter implementing `AuthAdapterInterface`.                                                                                                                                                                         | [README](packages/rockets-adapter-firebase/README.md)     | preview |
| `packages/rockets-server`               | `@concepta/rockets`                      | Launch-facing `createServer`, external-auth presentation, optional `/me`, default guard, and auth chain.                                                                                                                            | [README](packages/rockets-server/README.md)               | preview |
| `packages/rockets-server-auth`          | `@concepta/rockets-auth`                 | Built-in auth: signup, login, recovery, OTP, invitations, roles, throttling, and admin user CRUD.                                                                                                                                   | [README](packages/rockets-server-auth/README.md)          | preview |

### Repository layout

```text
rockets/
├── packages/
│   ├── rockets-core/                    Planner + auth wiring + shared helpers (zod layer at ./zod)
│   ├── rockets-repository-typeorm/      TypeORM adapter + zod entity compiler (./zod)
│   ├── rockets-repository-firestore/    Firestore adapter
│   ├── rockets-adapter-firebase/        Firebase auth adapter
│   ├── rockets-server/                  External-auth presentation (@concepta/rockets)
│   └── rockets-server-auth/             Built-in auth (@concepta/rockets-auth)
├── examples/                            sample-server, sample-server-auth, sample-code-review
└── package.json                         Yarn 4 workspace root
```

### Versions

- **Rockets packages**: source manifests are aligned at `1.0.0-alpha.8`;
  registry publication is pending. After publication, install the line with
  `yarn add @concepta/rockets@alpha` or pin `1.0.0-alpha.8`. Monorepo packages
  keep `workspace:^` for local development.
- **Upstream Concepta packages**: v8 modules are pinned to `8.0.0-alpha.10`;
  `@concepta/nestjs-common` remains at its latest published v8 build,
  `8.0.0-alpha.6`. Two modules remain on v7
  (`@concepta/nestjs-email`, `@concepta/nestjs-event`) pending the v8 port.
  Swagger UI ships from `@concepta/rockets-core`. Auth persistence entities are
  app-owned TypeORM classes — do not use `@concepta/nestjs-typeorm-ext`.
- **NestJS**: stable `12.0.1` core (`common`, `core`, `platform-express`,
  `testing`, `swagger`) with the satellites on their Nest 12 stable lines
  (`cqrs`, `typeorm`, `jwt`, `passport`, `config`). `@nestjs/throttler` is no
  longer a dependency — its latest release caps peers at Nest 11, and auth
  throttling runs on `@concepta/rockets-core`'s own rate-limit port.
- **Node**: `>=20.19.0` — CommonJS build loading ESM dependencies through
  `require(esm)`; Node 20.18 fails with `ERR_REQUIRE_ESM`. CI runs the unit
  and package e2e suites on the floor (20.19) and on 22; the example apps
  and the packed-consumer contract run on the floor in release-readiness. One
  caveat for consumers on 20.19
  whose test runner externalises ESM (Vitest, Jest ESM): `@nestjs/cqrs` is
  CommonJS and requires the ESM `@nestjs/core`; a require landing while the
  runner is still importing it throws `ERR_REQUIRE_CYCLE_MODULE` — preload
  `@nestjs/core` in a setup file (this repo does:
  `vitest.setup.preload-nest-core.mts`). Plain Node loads are unaffected.

### Common scripts (from the monorepo root)

| Command                       | Purpose                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `yarn release:check`          | Run the complete build, package, type, lint, unit, e2e, and sample release gate.                           |
| `yarn release:consumer`       | Pack every public workspace and verify a clean CJS, ESM, TypeScript, and Nest consumer.                    |
| `yarn api:report`             | Build, test, and verify the committed declaration-level public API report.                               |
| `yarn release:dry`            | Build publish archives for every public `@concepta/*` workspace without publishing.                       |
| `yarn install && yarn build`  | Bootstrap + compile every local `@concepta/*` package.                                                      |
| `yarn test`                   | Unit tests (Vitest).                                                                                       |
| `yarn typecheck:spec`         | Type-checks test files — the runner only transpiles them.                                                  |
| `yarn test:e2e`               | E2E tests across all packages and sample apps.                                                             |
| `yarn lint` / `yarn lint:fix` | ESLint.                                                                                                    |
| `yarn lint:md`                | Markdown lint.                                                                                             |
| `yarn sample:dev`             | Run `sample-server` in watch mode.                                                                         |
| `yarn sample-auth:dev`        | Run `sample-server-auth` in watch mode.                                                                    |
| `yarn sample-code-review:dev` | Build + run the full-stack example.                                                                        |

---

## Final Review Checklist

Use this before saying a change is done. It is intentionally short so a person
or coding agent can run it every time.

- Read the package README for every package you changed.
- Keep layer ownership intact: core owns shared wiring; `@concepta/rockets` owns
  external-auth presentation; `@concepta/rockets-auth` owns built-in auth.
- Keep persistence adapter-agnostic: feature code uses
  `RepositoryInterface` + `@InjectDynamicRepository`, not ORM-specific APIs.
- Keep ownership separate from authorization policy. Generic hooks and guards
  must not contain role-name bypasses such as `admin`; put policy in app/auth
  code or an explicit policy hook.
- For zod resources, `owner` / `f.owner()` marks and stamps owner columns. Add
  `OwnerScopeHook` or a custom scope hook explicitly when reads must be scoped.
- Do not add unused public types, flags, or options. If a field is not consumed
  by runtime behavior, remove it.
- Update docs and tests for any changed public behavior.
- Run, in order: `yarn build`, `yarn typecheck:spec`, `yarn test`,
  `yarn test:e2e`, `yarn lint:all`.
- If an example app covers the behavior, run its targeted e2e too.

## 5. Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup, the checks your
PR must pass, and the code standards. In short:

- Open an issue first for anything beyond a minor bug fix or doc tweak; use
  [Discussions](https://github.com/conceptadev/rockets/discussions) for design
  questions.
- Match the existing patterns: read the surrounding code before editing, prefer
  minimal diffs, no `any`, no `as unknown as Type`.
- Run `yarn build && yarn typecheck:spec && yarn lint:all && yarn test &&
  yarn test:e2e` before sending a PR.
- The repo uses [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `chore:`, …). `husky` runs commit-msg + pre-commit hooks; do
  not bypass them.
- Reporting a vulnerability: see [SECURITY.md](SECURITY.md) — never in a public
  issue.
- Participation is governed by our
  [Code of Conduct](CODE_OF_CONDUCT.md).

## 6. Security

Report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/conceptadev/rockets/security/advisories/new)
for this repository. Do not open public issues for security bugs.

## 7. License

BSD-3-Clause.
