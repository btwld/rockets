# Rockets

![Rockets Logo](https://raw.githubusercontent.com/btwld/rockets/main/assets/rockets-icon.svg)

[![CI](https://img.shields.io/github/actions/workflow/status/btwld/rockets/ci-merge.yml?branch=main&label=CI)](https://github.com/btwld/rockets/actions/workflows/ci-merge.yml)
[![Codecov](https://codecov.io/gh/btwld/rockets/branch/main/graph/badge.svg)](https://codecov.io/gh/btwld/rockets)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-BSD--3--Clause-green.svg)](LICENSE.txt)

> Configuration-driven NestJS stack. One options object becomes a working API — auth, dynamic repositories, generated CRUD controllers, hooks, swagger.

**Status:** pre-1.0 (`1.0.0-alpha.9`, on npm under `@bitwild/*` with dist-tag `alpha`). The public surface (`AuthAdapterInterface`, `defineResource`, `defineModuleResource`, `RepositoryInterface`, the `RocketsModule.forRoot` options shape) is stable; field renames are still possible before 1.0. Pin exact versions in production.

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
  - [Engine (upstream `@concepta/nestjs-*`)](#engine-upstream-conceptanestjs)
  - [Upstream contributors and integration scope](#upstream-contributors-and-integration-scope)
  - [Package matrix](#package-matrix)
  - [Repository layout](#repository-layout)
  - [Versions](#versions)
  - [Common scripts](#common-scripts-from-the-monorepo-root)
  - [Architecture diagram (HTML)](docs/architecture-diagram.html)
- [5. Roadmap](#5-roadmap)
  - [Later (out of scope)](#later-out-of-scope-for-the-current-docwiring-pass)
  - [Non-goals for 1.0](#non-goals-for-10)
  - [Long-term vision](#long-term-vision-not-implemented-here)
- [6. Contributing](#6-contributing)
- [7. Security](#7-security)
- [8. License](#8-license)

---

## 1. Introduction

Rockets removes the part of a NestJS backend that you write the same way every time: an auth guard, an entity-to-controller pipeline, validation wiring, swagger annotations, owner scoping, repository plumbing. You describe each feature once as a config object, and the framework registers the modules, providers, controllers, and routes for you.

There is **no codegen step**. Everything happens at runtime through Nest dynamic modules. Adding a feature means appending an object to a `resources[]` array.

**Engine vs composition:** the **motor** is the upstream `@concepta/nestjs-*` stack (repository, CRUD, hooks, access control, and — on path B — user/role/otp modules). `@bitwild/rockets-*` packages are mostly **curated re-exports plus wiring**: `@bitwild/rockets-core` runs `buildAppRegistrationPlan` and turns your `resources[]` / `repository` / `auth` options into Nest imports that call those upstream modules. Rockets does not replace that stack; it centralises configuration. See [Engine (upstream)](#engine-upstream-conceptanestjs) in Reference.

### What problem each layer solves

Be explicit about **who owns which problem** — Rockets is not one monolith.

| Layer | Package(s) | Problem it solves |
|---|---|---|
| **Motor** | `@concepta/nestjs-*` (via `@bitwild/rockets-common`, `rockets-access-control`, …) | Reimplementing repository access, CRUD shape, hooks, and ACL primitives on every NestJS project. |
| **Composition** | `@bitwild/rockets-core` | Manually stitching Nest modules, entity registration, guard + adapter chain, and swagger for every new service — even when you already use Concepta motors. |
| **Path A — external identity** | `@bitwild/rockets` | **Micro app runtime** — shared guard, `/me`, auth chain, declarative `resources[]`. Users live outside the app (Firebase, Auth0, central JWT). Primary choice for Stargate-provisioned workflow APIs. See [packages/rockets-server/README.md](packages/rockets-server/README.md). |
| **Path B — built-in identity** | `@bitwild/rockets-auth` | The app **is** the user system (signup, login, OTP, roles, invitations) and you do not want to wire seven Concepta identity modules yourself. |

**Honest scope:** Rockets removes repeated **infrastructure** work on new backends (auth wiring, CRUD registration, persistence plumbing). Most calendar time on a real product is still domain logic, integrations, and operations — not something any framework eliminates.

### The two paths

There are two ways to run a Rockets app, and the choice depends on **where your users live**.

**Path A — External auth** (`@bitwild/rockets`). You bring an `AuthAdapterInterface` implementation. The framework gives you `/me`, a global guard, generated CRUD, hooks, swagger. Pick this when users live in Firebase, Auth0, a custom JWT issuer, or any other identity store.

**Path B — Built-in auth** (`@bitwild/rockets-auth`). The framework owns the user table. You get signup, login, password recovery, OTP, invitations, admin user CRUD, role-based access control — all wired through one `defineRocketsAuth()` call. Pick this when the app is the identity source.

The two paths share the same lower layers (resource planner, dynamic repository, hooks, swagger), so a feature added to one runs identically on the other.

#### Stargate, micro apps, and shared auth

Enterprise shape: **Stargate** (workflow platform, n8n-like) connects systems and provisions **micro apps**; each micro app is a small Nest API on **`@bitwild/rockets`** with **one shared identity** across the product.

| Piece | Role |
|-------|------|
| **Stargate** | Design cross-system workflows, call micro apps over HTTP, register URLs — orchestration, not domain CRUD |
| **Identity (once)** | Firebase / Okta / one `@bitwild/rockets-auth` deployment — login, tokens, shared **user id** |
| **Micro app** | `@bitwild/rockets` — global guard, `/me`, `userMetadata`, `resources[]` for one domain (billing, CRM, code review…) |
| **Stargate workflow** | Automation in Stargate (webhook → transform → call API → notify) |
| **Micro app workflow** | Business rules inside the API (hooks, services, CQRS) |

```
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

**Do**

- One issuer (IdP or central `rockets-auth`); every micro app uses an `AuthBootstrap` pointing at the **same** project/secret so `AuthorizedUser.id` matches everywhere.
- Same `userMetadata` contract in each micro app (profile row keyed by auth id, exposed on `/me`).
- Each squad owns only `repository` + `resources[]` for its domain (optional Firestore override per entity).

**Do not**

- Scaffold `defineRocketsAuth()` with a separate user DB in every Stargate-generated micro app — breaks SSO.
- Treat Stargate as the token issuer unless it actually is; micro apps must trust the real identity layer.
- Put domain persistence and CRUD inside Stargate — Stargate orchestrates; micro apps execute.

| Deployment | Identity (once) | Micro apps (many) |
|---|---|---|
| **Path A — external IdP** | Firebase / Auth0 / Okta | `@bitwild/rockets` — adapter validates IdP token; user id = IdP `sub` |
| **Path B — built-in** | `@bitwild/rockets-auth` (signup, login, JWT) | `@bitwild/rockets` — same JWT; user id = your user row |

**Multiple adapters** in `auth: [...]` are supported when each credential resolves to the **same** `AuthorizedUser.id` (e.g. Firebase for users + API key for automation — see [sample-code-review](examples/sample-code-review)).

See also [Run multiple auth credentials (chain)](#run-multiple-auth-credentials-chain) and [Mix two persistence adapters](#mix-two-persistence-adapters).

### The three contracts

The whole system rests on three TypeScript interfaces. Everything else is a default or a convenience built on top.

**`AuthAdapterInterface`** — the only thing the framework asks of your authentication.

```typescript
interface AuthAdapterInterface {
  authenticate(request: AuthRequest): Promise<AuthAttemptResult>;
}

type AuthAttemptResult =
  | { matched: false }                           // not this adapter's credential
  | { matched: true; user: AuthorizedUser }      // recognised and validated
  | { matched: true; error: HttpException };     // recognised but rejected

interface AuthorizedUser {
  id: string;
  sub: string;
  email?: string;
  userRoles?: { role: { name: string } }[];     // drives RBAC
  claims?: Record<string, unknown>;             // free-form IdP payload
}
```

`AuthServerGuard` iterates a chain of adapters. `matched: false` means "try the next adapter". `matched: true; user` stops the chain. `matched: true; error` stops the chain and throws — no surprising credential passthrough.

**`RepositoryInterface<T>`** — the only thing the framework asks of your persistence.

The contract lives in `@concepta/nestjs-repository` (import via `@bitwild/rockets-common` or `@bitwild/rockets-core`). Adapters that satisfy it: TypeORM (`@concepta/nestjs-repository-typeorm`), Firestore (`@bitwild/rockets-repository-firestore`), any custom adapter you write. Domain code uses `@InjectDynamicRepository(EntityClass)` and `RepositoryInterface<EntityClass>` — never `@InjectRepository`. The same handler runs against any adapter.

**`ResourceInput`** — the configuration shape that becomes a feature.

```typescript
type ResourceInput =
  | RocketsResourceConfig            // hand-built CRUD config
  | ReturnType<typeof defineResource>        // CRUD with auto-defaults
  | ReturnType<typeof defineModuleResource>  // non-CRUD Nest slice
  | ReturnType<typeof defineSubResource>;    // nested CRUD
```

`buildAppRegistrationPlan({ resourceDefinitions, repository, userMetadata })` walks the list, collects entities per adapter, materialises CrudModule features, and emits the final Nest module composition. This is where the "one options object" becomes Nest modules.

### What you do NOT need to write

A NestJS backend started from scratch needs all of the following — Rockets ships them:

- A JWT guard and `/me` route (path A) or a complete authentication module (path B).
- A list / read / create / update / delete controller per entity, with DTO validation and swagger schemas.
- TypeORM (or Firestore) module registration with the entity list — replaced by the planner deriving the list from `resources[]`.
- An owner-scoping hook so user A doesn't read user B's rows.
- A consistent error filter, a uniform `RepositoryInterface`, transaction primitives.
- The wiring that connects all of the above.

### What you still write

Your business logic, your DTOs, your entity classes, your custom hooks, your access-control rules. Rockets does not pretend to write those for you.

---

## 2. Get Started

### Prerequisites

- Node 18+.
- A package manager (yarn 4 / npm / pnpm — examples below use yarn).
- A database adapter — TypeORM with any supported driver is the most common. Firestore works via `@bitwild/rockets-repository-firestore`.

### Path A — External auth (minimal app, ~30 lines)

Install (minimal — one Rockets entry package is enough):

```bash
yarn add @bitwild/rockets@alpha \
  @concepta/nestjs-repository-typeorm typeorm @nestjs/typeorm sqlite3 \
  class-transformer class-validator reflect-metadata rxjs
```

**What installs automatically** when you add `@bitwild/rockets@alpha` (transitive `dependencies`):

| Pulled in for you | Packages |
|---|---|
| Other `@bitwild/*` | `rockets-core`, `rockets-common`, `rockets-access-control` |
| Upstream motor | `@concepta/nestjs-{repository,crud,hook,common,authentication,access-control,swagger-ui}` (via `@bitwild/rockets-common` re-exports) |
| Nest (Rockets runtime) | `@nestjs/common`, `@nestjs/core`, `@nestjs/cqrs`, `@nestjs/swagger`, `@nestjs/config` |

Optional add-ons (install when you need them):

| Package | When |
|---|---|
| `@bitwild/rockets-zod` + `@bitwild/rockets-zod-typeorm` + `zod` + `nestjs-zod` | Schema-first resources (`zodResource`) |
| `@bitwild/rockets-adapter-firebase` | Firebase ID tokens |
| `@bitwild/rockets-repository-firestore` | Firestore persistence |
| `@bitwild/rockets-auth@alpha` | Built-in signup/login (Path B) |

**What you still add explicitly** (and why):

| Package | Why not transitive |
|---|---|
| `@concepta/nestjs-repository-typeorm`, `typeorm`, `@nestjs/typeorm`, driver (`sqlite3`, `pg`, …) | Persistence adapter is an **app choice** — kept out of `@bitwild/*` so Firestore-only apps do not pull TypeORM |
| `class-transformer`, `class-validator`, `rxjs`, `reflect-metadata` | **peerDependencies** — npm/yarn expect the host Nest app to provide them (install peers or enable your package manager’s peer auto-install) |

Add `@bitwild/rockets-core` (or `rockets-common`, …) **only** if you import symbols from that package path in app code (e.g. `OwnerStampHook` from `@bitwild/rockets-core`). If everything comes from `@bitwild/rockets` re-exports, you do not need duplicate `@bitwild/*` lines.

Write an adapter (the only auth code you own):

```typescript
// src/auth/jwt.adapter.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
  extractBearerToken,
} from '@bitwild/rockets';

@Injectable()
export class JwtAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    try {
      const payload = verify(token, process.env.JWT_SECRET!) as {
        sub: string; email?: string;
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

Add a TypeORM bootstrap helper in your app — intentionally not a `@bitwild/*` package, so core/server/auth stay free of a TypeORM dependency. It implements `RepositoryBootstrap` so the planner calls `forRoot(entities)` once from `resources[]` + `userMetadata`, without a hand-maintained entity list:

```typescript
// src/repository/define-typeorm-repository.ts
import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import type { RepositoryBootstrap } from '@bitwild/rockets-core';
import type {
  DynamicRepositoryModule,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';

export function defineTypeOrmRepository<Connection extends TypeOrmModuleOptions>(
  connection: Connection,
): RepositoryBootstrap {
  return {
    name: 'typeorm-bootstrap',
    forFeature(entities: RepositoryProviderOptions[]): DynamicRepositoryModule {
      return TypeOrmRepositoryModule.forFeature(entities);
    },
    forRoot(entities: ReadonlyArray<Type<PlainLiteralObject>>): DynamicModule {
      return TypeOrmModule.forRoot({ ...connection, entities: [...entities] });
    },
  };
}
```

**Why this exists:** you pass only connection options (`type`, `database`, `synchronize`, …). You never maintain `entities: [PetEntity, UserMetadataEntity, …]` on `TypeOrmModule.forRoot`. When `RocketsModule` boots, the registration planner walks `resources[]`, `userMetadata.entity`, and any entities contributed by auth integrations, then calls `forRoot(mergedEntities)` once and `forFeature` per table. Services use `@InjectDynamicRepository(PetEntity)` and get a `RepositoryInterface<PetEntity>` — registration is automatic as long as the entity appeared in that plan.

Compose the app:

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { RocketsModule, defineResource } from '@bitwild/rockets';
import {
  OwnerStampHook,
  OwnerScopeHook,
} from '@bitwild/rockets-core';
import { JwtAdapter } from './auth/jwt.adapter';
import { PetEntity } from './pet/pet.entity';
import { UserMetadataEntity } from './user/user-metadata.entity';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './user/dto';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';

@Module({
  imports: [
    RocketsModule.forRoot({
      auth: JwtAdapter,
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
      },
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
        dropSchema: true,
      }),
      resources: [
        defineResource({
          entity: PetEntity,
          hooks: [
            OwnerStampHook.for(PetEntity),
            OwnerScopeHook.for(PetEntity),
          ],
        }),
      ],
    }),
  ],
})
export class AppModule {}
```

Run it:

```bash
yarn nest start
# GET    /me              (from MeController, returns user + userMetadata)
# PATCH  /me              (updates userMetadata)
# GET    /pets            (owner-scoped list)
# POST   /pets            (auto-stamps userId)
# GET    /pets/:id        (owner-scoped read)
# PATCH  /pets/:id        (owner-scoped update)
# DELETE /pets/:id        (owner-scoped delete)
# Swagger at /api
```

You wrote one adapter, one entity, one resource definition. The controllers, the validation pipeline, the global guard, the swagger document, the JWT route protection, and the owner scoping are all framework.

### Path B — Built-in auth (full user system)

Install the same packages as above plus `@bitwild/rockets-auth` and the upstream `@concepta/nestjs-*` line (most are transitive dependencies; `yarn install` will pull them).

Compose with `defineRocketsAuth()`. Reuse the same `defineTypeOrmRepository` helper from path A and pass the **same instance** to both `defineRocketsAuth({ persistence: { module: repo } })` and `RocketsModule.forRoot({ repository: repo })`. Register auth persistence rows via `buildRocketsAuthResources()` on `resources`:

```typescript
import { Module } from '@nestjs/common';
import { defineRocketsAuth, buildRocketsAuthResources } from '@bitwild/rockets-auth';
import { RocketsModule } from '@bitwild/rockets';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';

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
  userMetadata: { entity: UserMetadataEntity, createDto, updateDto },
  userCrud:    { model: UserDto, dto: { createOne, updateOne } },
  roleCrud:    { model: RoleDto, dto: { createOne, updateOne } },
  useFactory:  () => ({
    services: { mailerService },
    authentication: {
      ports: {
        recoveryNotification: { /* command classes */ },
        verifyNotification:   { /* command classes */ },
      },
    },
    settings: { /* role names, otp config, email templates */ },
  }),
};

const rocketsAuth = defineRocketsAuth(rocketsAuthInput);
const rocketsAuthResources = buildRocketsAuthResources(
  rocketsAuthInput.persistence,
  rocketsAuthInput.invitationEntity,
);

@Module({
  imports: [
    RocketsModule.forRoot({
      auth: rocketsAuth,
      repository: repo,
      resources: [...rocketsAuthResources, /* your defineResource bundles */],
    }),
  ],
})
export class AppModule {}
```

You now get `POST /signup`, `POST /token/password`, `POST /token/refresh`, `PATCH /me/password`, OTP flow, password recovery, admin user / role CRUD, invitation flow — plus everything path A gives you.

The monorepo ships runnable sample apps for both paths (`yarn sample:dev` and `yarn sample-auth:dev` from the repo root).

---

## 3. How-to Guides

### Run multiple auth credentials (chain)

`auth` accepts a single `AuthBootstrap` or an array. Each entry is one of:

- `defineFirebaseAuth({ forRoot | forRootAsync })` — Firebase Admin + `FirebaseAuthAdapter` (`@bitwild/rockets-adapter-firebase`).
- `defineRocketsAuth(...)` — built-in signup/login stack (`@bitwild/rockets-auth`); pair with `buildRocketsAuthResources()` on `resources`.
- App-local `AuthBootstrap` — `{ adapter, forRoot? }` for custom adapters (see `defineApiKeyAuth()` in sample-code-review).

Entity rows for auth-owned tables belong on `resources[]`, not inside the auth helper.

```typescript
import { defineFirebaseAuth } from '@bitwild/rockets-adapter-firebase';
import { defineModuleResource } from '@bitwild/rockets-core';
import { RocketsModule } from '@bitwild/rockets';

import { defineApiKeyAuth, apiKeyAuthResource } from './auth-api-key';
import { UserEntity } from './auth/user.entity';

RocketsModule.forRoot({
  auth: [
    defineFirebaseAuth({
      forRootAsync: { useFactory: resolveFirebaseAuthModuleOptions },
    }),
    defineApiKeyAuth(),
  ],
  userMetadata: { entity, createDto, updateDto },
  repository,
  resources: [
    defineModuleResource({ entities: [UserEntity] }),
    apiKeyAuthResource,
  ],
});
```

The guard iterates in order. The first adapter that returns `matched: true` wins. If it returns `matched: true; error`, the chain stops and the error is thrown.

### Mark a route as public

```typescript
import { AuthPublic } from '@bitwild/rockets';

@Controller('health')
export class HealthController {
  @Get() @AuthPublic() ok() { return { status: 'ok' }; }
}
```

`AuthServerGuard` skips routes tagged with `@AuthPublic`. To skip the guard wholesale, pass `enableGlobalGuard: false` to `RocketsModule.forRoot`.

### Add a non-CRUD feature (controller + service + entity)

`defineModuleResource` is the escape hatch when you want CRUD generation off and full Nest control on.

```typescript
import { defineModuleResource } from '@bitwild/rockets';

const billingFeature = defineModuleResource({
  entities: [InvoiceEntity],
  controllers: [BillingController],
  providers:   [BillingService],
  exports:     [BillingService],  // exported = globally injectable
});
```

`RocketsCoreModule` is global, so anything in `exports` is reachable from every other module — including the outer `RocketsModule.forRootAsync` factory's `inject:` list. Export the minimum to avoid name collisions.

### Add a nested CRUD resource (`/pets/:petId/tags`)

```typescript
import { defineSubResource } from '@bitwild/rockets';

const petTagResource = defineSubResource({
  parent: PetEntity,
  parentParam: 'petId',
  parentFk: 'petId',
  entity: PetTagEntity,
});
```

The framework generates `/pets/:petId/tags`, filters by `petId`, and verifies the caller owns the parent via `PathScopeGuard`.

### Wire TypeORM without hand-registering entities

Use a small app-local `defineTypeOrmRepository` helper (full sample in **Path A** above). It implements `RepositoryBootstrap` from `@bitwild/rockets-core` and stays **outside** `@bitwild/*` packages so core/server/auth never take a TypeORM dependency. Firestore-only apps skip it and use `@bitwild/rockets-repository-firestore` instead.

**What you declare vs what the framework registers**

| You configure | Planner collects |
|---|---|
| `defineResource({ entity: PetEntity })` | `PetEntity` → default `repository` adapter |
| `userMetadata: { entity: UserMetadataEntity, … }` | metadata row |
| `defineModuleResource({ entities: [InvoiceEntity], … })` | extra tables (CRUD or not) |
| `defineRocketsAuth({ persistence: { entities: { user: UserEntity, … } } })` | auth tables (path B) |
| `defineModuleResource({ entities: [{ entity: X, repository: FirestoreModule }] })` | per-entity adapter override |

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
      userMetadata: { entity: UserMetadataEntity, createDto, updateDto },
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

**What you write in services/handlers** — same for CRUD handlers, custom services, and access-query services:

```typescript
import { InjectDynamicRepository } from '@bitwild/rockets-core';
import type { RepositoryInterface } from '@bitwild/rockets-common';

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

No `TypeOrmModule.forFeature([PetEntity])` in feature modules. No `@InjectRepository`. If the entity is in the registration plan, `@InjectDynamicRepository` resolves at runtime.

**Built-in auth (path B):** pass the **same** `repository` instance to both entry points so one connection serves app tables and auth tables:

```typescript
const repository = defineTypeOrmRepository({ type: 'sqlite', database: ':memory:', synchronize: true });

const rocketsAuth = defineRocketsAuth({
  persistence: { module: repository, entities: { user: UserEntity, role: RoleEntity /* … */ } },
  // …
});

@Module({
  imports: [
    RocketsModule.forRoot({
      repository,
      auth: rocketsAuth,
      resources: [/* pet resources — no per-resource persistence block */],
    }),
  ],
})
export class AppModule {}
```

### Mix two persistence adapters

The default adapter goes in `repository:`. Override per entity inside a bundle:

```typescript
import { defineModuleResource } from '@bitwild/rockets';
import { defineFirestoreRepository } from '@bitwild/rockets-repository-firestore';

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

Everything else stays on the default adapter. The same `RepositoryInterface<T>` works across both.

Canonical mixed-store example: [sample-code-review](examples/sample-code-review) (`defineTypeOrmRepository` at root + `defineFirestoreRepository` on report entities). OPS layout: [ops-micro-apps-pattern.md](docs/ops-micro-apps-pattern.md).

### Scope rows to the authenticated user

```typescript
import { defineResource } from '@bitwild/rockets';
import { OwnerStampHook, OwnerScopeHook } from '@bitwild/rockets-core';

defineResource({
  entity: PetEntity,
  hooks: [
    OwnerStampHook.for(PetEntity),  // create/update: stamp userId
    OwnerScopeHook.for(PetEntity),  // list/read/update/delete: filter by userId
  ],
});
```

Both default to a `userId` column; pass a second argument to override (`OwnerStampHook.for(PetEntity, 'ownerId')`). Hooks run at the repository layer, so direct (non-HTTP) calls are scoped too.

### Read the authenticated user inside a CRUD handler

CRUD-generated controllers don't expose method signatures you can decorate. Use `getActor` inside the command / query handler:

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { CrudCreateCommand, CrudWithBodyCommandHandler } from '@concepta/nestjs-crud';
import { getActor } from '@bitwild/rockets-core';

@CommandHandler(CrudCreateCommand)
export class PetCreateHandler extends CrudWithBodyCommandHandler {
  async execute(cmd: CrudCreateCommand) {
    const actor = getActor(cmd.context);
    // actor.id, actor.email, actor.userRoles
    return super.execute(cmd);
  }
}
```

In controllers you own, import `@AuthUser()` from `@bitwild/rockets-common` (same decorator the built-in `/me` route uses). `AuthorizedUser` types come from `@bitwild/rockets` or `@bitwild/rockets-core`.

### Add role-based access control

The ACL primitives live in `@bitwild/rockets-access-control` (a re-export of `@concepta/nestjs-access-control`). Define a grant table, implement `AccessControlServiceInterface` to feed the guard with user + roles, register the module, decorate routes:

```typescript
import {
  AccessControlModule,
  AccessControlGuard,
  AccessControlReadOne,
} from '@bitwild/rockets-access-control';

AccessControlModule.forRoot({
  settings: { rules: APP_ACL },
  service:  AcService,
});
// register AccessControlGuard via APP_GUARD

@Controller('pets')
class PetController {
  @Get(':id') @AccessControlReadOne('pet') read() { /* ... */ }
}
```

`AccessControlServiceInterface.getUserRoles()` typically returns `user.userRoles?.map(ur => ur.role.name) ?? []` — the same shape `AuthorizedUser.userRoles` carries.

### Disable the global guard or the `/me` controller

```typescript
RocketsModule.forRoot({
  auth, userMetadata, repository,
  enableGlobalGuard: false,
  disableController: { me: true },
});
```

Useful when an upstream module already registers a global guard, or when your app provides its own `/me`.

### Override a default user-metadata handler

```typescript
import {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
} from '@bitwild/rockets';

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

The base classes call the dynamic repository against `userMetadata.entity`. Subclass to add side effects, audit logs, or alternative storage.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Cannot find provider AUTH_ADAPTERS_TOKEN` | `auth:` option omitted | Pass at least one adapter to `RocketsModule.forRoot({ auth })`. |
| Routes 401 even with a valid token | Adapter returns `matched: false` | Read the token: `extractBearerToken(request)` must not be `null`. Check `Authorization: Bearer <token>` header on the request. |
| DTO fields missing from swagger | `@nestjs/swagger` CLI plugin is NOT enabled | Add `@ApiProperty()` / `@ApiPropertyOptional()` to every public field — type inference alone won't populate the schema. |
| `OwnerScopeHook` doesn't filter | `HookModule` not registered in DI | Don't remove `HookModule.forRoot({})` from core's `createCoreImports`; without it, the hook resolver is `undefined` and decorators become silent no-ops. |
| `definitionTransform` async wiring broken | Missed merging `defImports` | Always `imports: [...defImports, ...createCoreImports(extras)]`. Losing `defImports` silently breaks `RAW_OPTIONS_TOKEN` injection. |
| Two `Logger` / `AuditService` collide | Two bundles export classes with the same name | `RocketsCoreModule` is global; everything in a `defineModuleResource` `exports` array is reachable everywhere. Prefix the name (`BillingPriceFormatter`) or use an injection token. |
| Custom hook always returns 500 | Threw a generic `Error` or wrong exception type | Use `@concepta/nestjs-common` domain exceptions (`ModelValidationException`, …) or map in your exception filter. Repository/HTTP hooks run inside upstream hook + CRUD pipeline — see `@concepta/nestjs-hook` docs. |

---

## 4. Reference

### Engine (upstream `@concepta/nestjs-*`)

The **runtime motor** is the Concepta Nest modules (`@concepta/nestjs-repository`, `@concepta/nestjs-crud`, `@concepta/nestjs-hook`, `@concepta/nestjs-common`, `@concepta/nestjs-access-control`, `@concepta/nestjs-authentication`, and the domain modules used by built-in auth). Those packages own query execution, CRUD CQRS handlers, hook pipelines, RBAC guards, and — when you opt in — signup/login/user tables.

Rockets **does not reimplement** that behaviour. It **configures and registers** it: one `RocketsModule.forRoot({ ... })` object is split by `buildAppRegistrationPlan` into the upstream `RepositoryModule`, `CrudModule`, `HookModule`, and related imports your app would otherwise wire by hand.

| Motor | `@bitwild/*` import path | Used for |
|---|---|---|
| `@concepta/nestjs-repository` | `@bitwild/rockets-common` (re-export) | `RepositoryInterface`, dynamic repositories, transactions, repo hooks |
| `@concepta/nestjs-crud` | `@bitwild/rockets-common` (re-export) | Generated controllers, CQRS commands/queries, default handlers |
| `@concepta/nestjs-hook` | `@bitwild/rockets-common` | `HookModule`, specifications, shared exceptions, Swagger UI |
| `@concepta/nestjs-access-control` | `@bitwild/rockets-access-control` | Grant table, `AccessControlGuard`, route decorators |
| `@concepta/nestjs-repository-typeorm` (app dep) | app-local `defineTypeOrmRepository` | SQL adapter — intentionally **not** a `@bitwild/*` package |
| `@concepta/nestjs-user`, `role`, `otp`, `password`, `invitation`, `federated`, `email`, `event` | wired inside `@bitwild/rockets-auth` | Built-in auth HTTP + persistence rows (path B only) |

| Rockets layer | Role |
|---|---|
| `@bitwild/rockets-core` | **Planner and contracts**: `defineResource`, `buildAppRegistrationPlan`, `AuthServerGuard`, owner/path hooks, swagger registration |
| `@bitwild/rockets` (server) | **External-auth presentation**: `MeController`, default `APP_GUARD`, `auth` chain merge |
| `@bitwild/rockets-auth` | **Built-in identity bundle**: `defineRocketsAuth()` + `buildRocketsAuthResources()` |

**Path B uses both** `@bitwild/rockets` and `@bitwild/rockets-auth`: `defineRocketsAuth()` supplies the auth bootstrap; spread `buildRocketsAuthResources()` into `resources`; `RocketsModule.forRoot({ auth, repository, resources })` still comes from the server package. They are sibling packages over core, not parent/child.

**Repository injection (upstream contract, Rockets-local decorator):**

- **Recommended:** `@InjectDynamicRepository(UserEntity)` — key derived via `deriveEntityKey()` so it matches `defineResource({ entity: UserEntity })`.
- **Escape hatch:** `@InjectDynamicRepository('billing/invoice')` when the registration key is namespaced or does not follow the entity class name (overrides, legacy schemas).

**Override a default CRUD handler:** set `operations.<op>.commandHandler` or `queryHandler` on the resource config — upstream `CrudModule` uses your class instead of the default; the defaults exist for convenience only.

**Docs:** [`architecture-diagram.html`](docs/architecture-diagram.html) (Stargate · identity · micro apps) · [`ops-micro-apps-pattern.md`](docs/ops-micro-apps-pattern.md).

### Upstream contributors and integration scope

If you maintain `@concepta/nestjs-*` modules, Rockets is a **consumer and configuration façade** — not a fork.

| Topic | Current decision |
|---|---|
| **Your modules stay the motor** | `RepositoryInterface`, `CrudModule`, `HookModule`, RBAC, and identity domains are unchanged upstream; Rockets calls them through `buildAppRegistrationPlan`. |
| **What Rockets owns** | `defineResource`, `defineModuleResource`, `AuthAdapterInterface` + guard chain, `RepositoryBootstrap`, swagger registration, `/me` (server), `defineRocketsAuth()` (auth bundle). |
| **`@bitwild/rockets-common`** | Re-exports `@concepta/nestjs-hook`, `nestjs-common`, `nestjs-authentication`, `nestjs-swagger-ui` plus small helpers (`deriveEntityKey`, …). It is **not** a rename of “utils” and **not** a replacement for the upstream **app-module** composition pattern — that wiring still lives in Concepta; Rockets adds a **second** entry point (`RocketsModule.forRoot`) that feeds the same motors. |
| **Port backlog (server path)** | On v8 today: `repository`, `crud`, `hook`, `common`, `authentication`. Still on v7 in this monorepo: `access-control`, `swagger-ui` (and `email` / `event` on the auth path). Finishing the `access-control` v8 port unblocks RBAC without changing Rockets’ public API. |
| **Repo migration** | Moving all of `nestjs-modules` into this git repo is **optional** for product validation. Shipping fixes against published `@concepta/*` alphas is fine; monorepo colocation is for AI context and version lock, not a prerequisite to use Rockets. |
| **Safe to keep building on** | These are intentional, tested surfaces — not throwaway experiments: `AuthAdapterInterface.authenticate`, `RepositoryInterface` + dynamic repository keys (class **or** string token), `defineResource` / planner-driven entity registration, `defineRocketsAuth({ persistence: { module } })` sharing one `repository` instance with `RocketsModule.forRoot`. |

**Custom validation / business rules:** use `defineHook` from `@bitwild/rockets-core` for simple entity lifecycle rules, upstream `@concepta/nestjs-hook` (`Spec`, `UseHooks`, repository hooks) for class-based hooks, or replace a CRUD operation handler. Throw domain exceptions from `@concepta/nestjs-common` (`ModelValidationException`, etc.) so filters map them to 4xx — a bare `Error` in a hook often surfaces as 500.

### Package matrix

| Package | npm name | Purpose | Docs | Status |
|---|---|---|---|---|
| `packages/rockets-common` | `@bitwild/rockets-common` | Re-exports `@concepta/nestjs-{hook,common,authentication,repository,crud,swagger-ui}` + local helpers (`deriveEntityKey`, `InjectDynamicRepository`, …). | [README](packages/rockets-common/README.md) | stable |
| `packages/rockets-access-control` | `@bitwild/rockets-access-control` | RBAC: `AccessControlModule`, `AccessControlGuard`, operation decorators, `CanAccess` query checks. | [README](packages/rockets-access-control/README.md) | stable (upstream still on v7) |
| `packages/rockets-core` | `@bitwild/rockets-core` | Composition planner. Auth chain, `buildAppRegistrationPlan`, `defineResource` / `defineModuleResource` / `defineSubResource`, `defineHook`, owner/path hooks, swagger registration. | [README](packages/rockets-core/README.md) | stable |
| `packages/rockets-zod` | `@bitwild/rockets-zod` | Zod-first resources: `zodResource`, field metadata, DTO + entity compilation via `SchemaEntityCompiler`. | [README](packages/rockets-zod/README.md) | stable |
| `packages/rockets-zod-typeorm` | `@bitwild/rockets-zod-typeorm` | TypeORM `SchemaEntityCompiler` for `@bitwild/rockets-zod`. | [README](packages/rockets-zod-typeorm/README.md) | stable |
| `packages/rockets-repository-firestore` | `@bitwild/rockets-repository-firestore` | Firestore adapter implementing `RepositoryAdapter`. Per-entity opt-in. | [README](packages/rockets-repository-firestore/README.md) | preview |
| `packages/rockets-adapter-firebase` | `@bitwild/rockets-adapter-firebase` | Firebase Auth adapter implementing `AuthAdapterInterface`. | [README](packages/rockets-adapter-firebase/README.md) | preview |
| `packages/rockets-server` | `@bitwild/rockets` | External-auth presentation layer. `MeController`, `APP_GUARD` opt-in, `auth` chain. | [README](packages/rockets-server/README.md) | stable |
| `packages/rockets-server-auth` | `@bitwild/rockets-auth` | Built-in auth: signup, login, OTP, recovery, invitations, roles, admin user CRUD. `defineRocketsAuth()`. | [README](packages/rockets-server-auth/README.md) | alpha |

### Repository layout

```
rockets/
├── packages/
│   ├── rockets-common/                  @concepta re-exports + repository/CRUD helpers
│   ├── rockets-access-control/          RBAC
│   ├── rockets-core/                    Planner + auth wiring
│   ├── rockets-zod/                     Schema-first resources
│   ├── rockets-zod-typeorm/             TypeORM entity compiler for zod
│   ├── rockets-repository-firestore/    Firestore adapter
│   ├── rockets-adapter-firebase/        Firebase auth adapter
│   ├── rockets-server/                  External-auth presentation (@bitwild/rockets)
│   └── rockets-server-auth/             Built-in auth (@bitwild/rockets-auth)
├── examples/                            sample-server, sample-server-auth, sample-code-review
├── docs/                                architecture-diagram.html, ops-micro-apps-pattern.md
└── package.json                         Yarn 4 workspace root
```

### Versions

- **Rockets packages**: `1.0.0-alpha.9` on npm (`yarn add @bitwild/rockets@alpha`, or pin `1.0.0-alpha.9`). Monorepo packages keep `workspace:^` for local development.
- **Upstream Concepta packages**: v8 line at `8.0.0-alpha.5`. Three packages still on v7 (`@concepta/nestjs-access-control`, `@concepta/nestjs-email`, `@concepta/nestjs-event`) pending the v8 port — version-mismatched intentionally and tested in CI.
- **NestJS**: `^11.0.0`, pinned to `11.1.18` via root `resolutions`.
- **Node**: `>=18.0.0`.

### Common scripts (from the monorepo root)

| Command | Purpose |
|---|---|
| `yarn publish:bitwild` | Build + publish all `@bitwild/*` packages to npm (`--tag alpha`). See `scripts/publish-bitwild-order.txt`. |
| `yarn install && yarn build` | Bootstrap + compile every local `@bitwild/*` package. |
| `yarn test` | Unit tests (jest, 30s timeout). |
| `yarn test:e2e` | E2E tests across all packages and sample apps. |
| `yarn lint` / `yarn lint:fix` | ESLint. |
| `yarn lint:md` | Markdown lint. |
| `yarn sample:dev` | Run `sample-server` in watch mode. |
| `yarn sample-auth:dev` | Run `sample-server-auth` in watch mode. |
| `yarn sample-code-review:dev` | Build + run the full-stack example. |
| `yarn generate-swagger` | Dump the OpenAPI spec from `sample-server-auth`. |

---

## 5. Contributing

- Open an issue first for anything beyond a minor bug fix or doc tweak.
- Match the existing patterns: read the surrounding code before editing, prefer minimal diffs, no `any`, no `as unknown as Type`.
- Run `yarn lint && yarn test && yarn test:e2e` before sending a PR.
- The repo uses [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, …). `husky` runs commit-msg + pre-commit hooks; do not bypass them.

## 6. Security

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/btwld/rockets/security/advisories/new) for this repository. Do not open public issues for security bugs.

## 7. License

BSD-3-Clause.
