# `@bitwild/rockets-core`

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-core)](https://www.npmjs.com/package/@bitwild/rockets-core)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Shared server infrastructure for the Rockets ecosystem. Auth abstraction,
CQRS wiring, declarative resources, repository registration, Swagger
setup — the foundation that `@bitwild/rockets` and `@bitwild/rockets-auth`
build on.

> **Most apps don't import this directly.** Install
> [`@bitwild/rockets`](../rockets-server/) (bring-your-own auth) or
> [`@bitwild/rockets-auth`](../rockets-server-auth/) (built-in auth)
> instead. They re-export everything you need from core.

---

## Table of contents

- [Introduction](#introduction)
- [Tutorial — Bootstrap a core-only app](#tutorial--bootstrap-a-core-only-app)
- [How-to guides](#how-to-guides)
- [Reference](#reference)
- [Explanation](#explanation)
- [License](#license)

---

## Introduction

`rockets-core` is the **declarative composition layer** that turns a
list of bundles into a working NestJS application. Three things flow
through one configuration object:

1. **A persistence adapter** (`repository`) — any
   `RepositoryModuleInterface` (TypeORM, Firestore, Mongo, …).
2. **User-metadata wiring** (`userMetadata`) — the entity + DTOs the
   core uses to store profile data alongside the auth identity.
3. **A list of resources** (`resources`) — bundles produced by
   `defineResource()` (CRUD-shaped) or `defineModuleResource()`
   (non-CRUD persistence + Nest wiring).

Internally, `buildAppRegistrationPlan()` aggregates these into a single
`AppRegistrationPlan { crudResources, entityRegistrations, nestModules }`
that the module-definition consumes to wire `RepositoryModule.forFeature`,
`CrudModule.forFeature`, and the materialised feature modules.

### When to use this package directly

Pick `rockets-core` only if you want the infrastructure but **none of
the opinionated layers above it**:

- ✓ You implement your own auth provider AND your own `/me` endpoint.
- ✓ You want declarative CRUD via `defineResource()` without a global guard.
- ✓ You're building a custom composition root and don't want
  `rockets-server`'s presentation layer.

For 95 % of apps, use `@bitwild/rockets` or `@bitwild/rockets-auth`.

### What this package does NOT provide

- No controllers (no presentation layer in core).
- No login / signup / OAuth / OTP — those live in `rockets-server-auth`.
- No `/me` endpoint — that lives in `rockets-server`.

---

## Tutorial — Bootstrap a core-only app

You'll get a NestJS app that:

- Validates a bearer token through your own `AuthAdapterInterface`.
- Registers a CRUD `pet` resource with auto-generated handlers.
- Stores user metadata in TypeORM.

### 1. Install

```bash
yarn add @bitwild/rockets-core @concepta/nestjs-repository @concepta/nestjs-repository-typeorm @nestjs/typeorm typeorm
```

### 2. Implement an `AuthAdapterInterface`

```typescript
// my-auth.adapter.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import type { AuthAdapterInterface, AuthorizedUser } from '@bitwild/rockets-core';

@Injectable()
export class MyAuthAdapter implements AuthAdapterInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    const payload = verify(token, process.env.JWT_SECRET!) as {
      sub: string;
      email: string;
    };
    return {
      id: payload.sub,
      sub: payload.sub,
      email: payload.email,
      userRoles: [],
      claims: payload,
    };
  }
}
```

### 3. Wire `RocketsCoreModule`

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import {
  RocketsCoreModule,
  defineResource,
  defineModuleResource,
} from '@bitwild/rockets-core';
import { UserMetadataEntity, PetEntity, AuditLogEntity } from './entities';
import { AuditService } from './audit/audit.service';
import { MyAuthAdapter } from './my-auth.adapter';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [UserMetadataEntity, PetEntity, AuditLogEntity],
      synchronize: true,
    }),
    RocketsCoreModule.forRootAsync({
      inject: [MyAuthAdapter],
      useFactory: (authProvider) => ({ authProvider }),
      repository: TypeOrmRepositoryModule,
      userMetadata: { entity: UserMetadataEntity },
      resources: [
        defineResource({
          key: 'pet',
          entity: PetEntity,
          path: 'pets',
          tags: ['Pets'],
        }),
        defineModuleResource({
          entities: [{ key: 'audit-log', entity: AuditLogEntity }],
          module: { providers: [AuditService], exports: [AuditService] },
        }),
      ],
    }),
  ],
  providers: [MyAuthAdapter],
})
export class AppModule {}
```

### 4. Run

```bash
nest start
```

You now have:

- `GET/POST/PATCH/DELETE /pets` — auto-generated CRUD.
- `AuditLogEntity` registered as a dynamic repository (key `audit-log`).
- `MyAuthAdapter.validateToken()` called on every protected request.

> Need `/me`? Use [`@bitwild/rockets`](../rockets-server/) instead.

---

## How-to guides

### How to add a new entity to an existing app

Use either `defineResource()` (auto-contributes the entity, generates
CRUD) or `defineModuleResource({ entities: [...] })` (entity-only or
entity + Nest wiring):

```typescript
// CRUD-shaped: pet entity gets auto-registered under key 'pet'.
defineResource({ key: 'pet', entity: PetEntity, path: 'pets' })

// Non-CRUD: junction table or supporting table with no controller.
defineModuleResource({
  entities: [{ key: 'pet-tag', entity: PetTagEntity }],
  module: {},
})

// Non-CRUD with services + controller colocated.
defineModuleResource({
  entities: [{ key: 'pet-share', entity: PetShareEntity }],
  module: {
    controllers: [PetShareController],
    providers: [PetShareService],
    exports: [PetShareService], // exports propagate globally
  },
})
```

### How to inject a dynamic repository

```typescript
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';

@Injectable()
export class PetService {
  constructor(
    @InjectDynamicRepository('pet')
    private readonly petRepo: RepositoryInterface<PetEntity>,
  ) {}

  async findByOwner(ownerId: string) {
    return this.petRepo.find({
      where: Where.eq<PetEntity>('ownerId', ownerId),
    });
  }
}
```

The key string (`'pet'`) is the same one passed to `defineResource()`
or `defineModuleResource({ entities: [{ key: 'pet', ... }] })`.

### How to override the per-entity adapter (mixed-store apps)

```typescript
RocketsCoreModule.forRoot({
  // Default for everything else
  repository: TypeOrmRepositoryModule,

  // userMetadata in Firestore
  userMetadata: {
    entity: UserMetadataEntity,
    repository: FirestoreRepositoryModule,
  },

  resources: [
    // pet in TypeORM (default)
    defineResource({ key: 'pet', entity: PetEntity, path: 'pets' }),

    // analytics in Firestore (per-entity override)
    defineModuleResource({
      entities: [{
        key: 'analytics-event',
        entity: AnalyticsEventEntity,
        repository: FirestoreRepositoryModule,
      }],
      module: { providers: [AnalyticsService] },
    }),
  ],
})
```

### How to access the authenticated user inside a handler

```typescript
import { getAuthorizedUserFromCrudContext } from '@bitwild/rockets-core';

@CommandHandler(CrudCreateCommand)
export class PetCreateHandler {
  async execute(cmd: CrudCreateCommand) {
    const authUser = getAuthorizedUserFromCrudContext(cmd.context);
    // authUser.id, authUser.email, authUser.userRoles
  }
}
```

No parameter drilling, no request mutation, no custom decorators.

### How to apply repository hooks (per-request scoping)

```typescript
import { OwnerScopeHook } from '@bitwild/rockets-core';
import { UseHooks } from '@bitwild/rockets-common';

defineResource({
  key: 'pet',
  entity: PetEntity,
  path: 'pets',
  controller: {
    extraDecorators: [UseHooks(OwnerScopeHook)],
  },
})
// Add OwnerScopeHook to the resource's `providers: [...]` too.
```

`OwnerScopeHook` filters List/Read/Update/Delete by the authenticated
user's id. For Create, you still need a custom command handler — that
column has to go into the body, not the where clause.

### How to swap the persistence adapter (e.g. Firestore)

```typescript
// Replace the import
import { FirestoreRepositoryModule } from '@bitwild/rockets-repository-firestore';

RocketsCoreModule.forRoot({
  // ...
  repository: FirestoreRepositoryModule,
})
```

Domain code (services, handlers, hooks) **does not change** — it depends
on `RepositoryInterface`, not on the concrete adapter.

---

## Reference

### `RocketsCoreModule.forRoot(options) / forRootAsync(asyncOptions)`

| Field | Type | Required | Description |
|---|---|---|---|
| `authProvider` | `AuthAdapterInterface` | ✅ | Validates bearer tokens; produces `AuthorizedUser`. |
| `repository` | `RepositoryModuleInterface` | optional | Default persistence adapter. Required if any bundle has unannotated entities. |
| `userMetadata` | `RocketsUserMetadataConfig` | optional | Entity + DTOs for the metadata table. |
| `resources` | `ReadonlyArray<ResourceInput>` | optional | Mix of `defineResource()`, `defineModuleResource()`, manual configs. |
| `handlers` | `{ upsertUserMetadata?, getUserMetadata? }` | optional | Override the default user-metadata CQRS handlers. |
| `providers` | `Provider[]` | optional | Extra providers registered on `RocketsCoreModule`. |
| `global` | `boolean` | default `true` | Module is global (its exports become app-wide). |

### `defineResource(input)` — CRUD-shaped feature

| Field | Type | Description |
|---|---|---|
| `key` | `string` | Dynamic-repository key (e.g. `'pet'`). |
| `entity` | `Type` | The entity class. Auto-registered. |
| `path` | `string` | HTTP path (e.g. `'pets'`). |
| `tags` | `string[]` | Swagger tags. |
| `relations` | `relation()[]` | Cross-resource relations (validated against the entity index). |
| `subResources` | `Record<string, defineSubResource()>` | Nested resources. |
| `controller` | `{ extraDecorators?, response? }` | Append decorators / response shape. |
| `operations` | `Operation[]` | Override default CRUD operations / handlers. |

### `defineModuleResource(input)` — non-CRUD feature

| Field | Type | Description |
|---|---|---|
| `entities` | `ReadonlyArray<{ key, entity, repository? }>` | Persistence rows contributed by this feature. Optional. |
| `module` | `{ imports?, controllers?, providers?, exports? }` | Nest dynamic module slice colocated with the feature. |

`exports` propagate globally (see [Explanation — feature exports](#feature-exports-are-globally-visible)).

### `userMetadata` config

| Field | Type | Description |
|---|---|---|
| `entity` | `Type` | The metadata table entity. |
| `createDto` | `Type` | DTO validated on `PATCH /me` create path. |
| `updateDto` | `Type` | DTO validated on `PATCH /me` update path. |
| `responseDto` | `Type` | optional response shape. |
| `repository` | `RepositoryModuleInterface` | optional per-entity override. |

### `AuthAdapterInterface`

```typescript
interface AuthAdapterInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}

interface AuthorizedUser {
  id: string;                                    // required
  sub: string;                                   // required (often === id)
  email?: string;
  userRoles?: { role: { name: string } }[];      // drives RBAC
  claims?: Record<string, unknown>;              // free-form IdP payload
}
```

### `AppRegistrationPlan` (returned by `buildAppRegistrationPlan`)

| Field | Type | Description |
|---|---|---|
| `crudResources` | `ReadonlyArray<RocketsResourceConfig>` | CRUD configs passed to `CrudModule.forFeature()`. |
| `entityRegistrations` | `ReadonlyArray<RepositoryPersistenceConfig>` | One row per persistence adapter group. |
| `nestModules` | `ReadonlyArray<DynamicModule>` | Materialised feature-resource Nest slices. |

This is internal — apps don't construct it directly. Documented for
people debugging the wiring.

### Helpers

| Symbol | Purpose |
|---|---|
| `defineResource()` | Build a CRUD-shaped resource bundle. |
| `defineModuleResource()` | Build a non-CRUD feature resource bundle. |
| `defineSubResource()` | Nested resource (1-level) under a parent. |
| `relation(source, target, prop, opts?)` | Type-safe cross-resource relation declaration. |
| `getAuthorizedUserFromCrudContext(ctx)` | Read the auth user from the CRUD context. |
| `OwnerScopeHook` | Repository hook scoping List/Read/Update/Delete to `authUser.id`. |
| `AuthServerGuard` | The bearer-token guard. Opt-in via `APP_GUARD` (in server packages). |
| `@AuthPublic()` | Mark a route or controller as not requiring authentication. |

---

## Explanation

### Why `rockets-core` has no controllers

Core is shared infrastructure. Both `rockets-server` (external auth)
and `rockets-server-auth` (built-in auth) sit on top of it. A controller
in core would force both consumers to ship that route. Putting routes
in the server packages keeps each composition pure.

### Single `repository`, bundles own entities

Earlier versions used `repositories: { module, entities[] }` — one block
listing every entity. That had two problems: (1) entities lived in a
flat list disconnected from the feature that needed them, (2) splitting
or moving a feature meant editing two places.

Today the contract is: **one default adapter at the top level**
(`repository`), and **every entity comes from a bundle**
(`defineResource()` auto-contributes; `defineModuleResource()` lists
what it owns). Per-entity adapter overrides exist for mixed-store apps
(`userMetadata.repository`, `entry.repository`).

This is the protocol we converged on after iterating across two majors.
See `AGENTS.md` Hard-Learned Rule #4 for the canonical rationale.

### Database-agnostic by default

The supported contract is `RepositoryInterface` (from
`@bitwild/rockets-repository`). Concrete backends — TypeORM, Firestore,
custom — are pluggable per app. `rockets-core` itself never imports
TypeORM; example configs use it only as the common case.

### Feature exports are globally visible

`RocketsCoreModule` is a global Nest module (`global: true`). Every
feature resource's `exports: [...]` is re-exported by core, which makes
them globally injectable. Two consequences:

1. **Powerful** — the `inject: [SampleAuthAdapter]` factory of an outer
   `RocketsModule.forRootAsync` can resolve a provider that lives
   inside a feature resource, no separate import needed.
2. **Dangerous** — two feature resources exporting providers with the
   same name (`PriceFormatter`, `AuditService`) collide silently in the
   DI container.

**Rule** (also enforced in `AGENTS.md` Hard-Learned Rule #14): only
export from a feature resource what other features or outer factories
**actually inject**. Internal helpers stay in `providers` only. When a
shared name is unavoidable, prefix it (`BillingPriceFormatter`) or use
an injection token.

### Architecture

```text
rockets-common         shared utils, zero framework opinion
rockets-repository     abstract data access (no TypeORM, no Firestore)
rockets-crud           generic CRUD
rockets-access-control ACL/RBAC
    ▲
rockets-core           ◀── THIS PACKAGE
    ▲
rockets-server         composition root for external auth integration
rockets-server-auth    full auth system (JWT, signup, login, OAuth, OTP)
```

### Related documentation

- [How to declare a resource](../../docs/how-to/crud/declare-a-resource.md)
- [How to swap TypeORM for Firestore](../../docs/how-to/persistence/swap-typeorm-for-firestore.md)
- [How to add an entity](../../docs/how-to/persistence/add-an-entity.md)
- [Architecture flow diagram](../../docs/diagrams/rockets-architecture-flow.md)
- [ADR 0003 — auth-persistence asymmetry](../../docs/explanation/adr/0003-auth-persistence-asymmetry.md)

---

## License

MIT — see [`../../LICENSE.txt`](../../LICENSE.txt).
