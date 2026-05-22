# `@bitwild/rockets-core`

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-core)](https://www.npmjs.com/package/@bitwild/rockets-core)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

The **shared engine** under every Rockets app. It knows nothing about
HTTP routes, signup forms, or your IdP — it just owns the wiring that
both `@bitwild/rockets` (bring-your-own auth) and
`@bitwild/rockets-auth` (built-in auth) build on.

> **You probably don't import this directly.** Use
> [`@bitwild/rockets`](../rockets-server/) or
> [`@bitwild/rockets-auth`](../rockets-server-auth/) — they re-export
> everything in core and add the parts you'll actually call.

---

## Table of contents

- [What is `rockets-core` (in plain English)](#what-is-rockets-core-in-plain-english)
- [Why does it exist?](#why-does-it-exist)
- [Designed for AI-driven code generation](#designed-for-ai-driven-code-generation)
- [What it does — three jobs](#what-it-does--three-jobs)
- [What it does NOT do](#what-it-does-not-do)
- [Tutorial — boot a tiny core-only app](#tutorial--boot-a-tiny-core-only-app)
- [How-to guides](#how-to-guides)
- [Reference](#reference)
- [License](#license)

---

## What is `rockets-core` (in plain English)

Think of a typical NestJS app: you have entities, controllers, a JWT
guard, Swagger setup, a CQRS bus, dozens of `@Module` files, and a
TypeORM connection. Every project re-writes the same boring plumbing.

`rockets-core` does that plumbing **once**, behind one configuration
object. You hand it:

1. **An auth check** — "given a bearer token, who is this?"
2. **A database adapter** — "use TypeORM" (or Firestore, or Mongo).
3. **A list of features** — "I have a `Pet` resource, an audit log, …"

It hands back a working application: protected routes, a CRUD API,
auto-generated Swagger, and one global guard. **You wrote no
controllers, no `@Module` boilerplate, no entity registration.**

---

## Why does it exist?

We kept building NestJS APIs and noticed two things:

- **90% of every app is the same.** Auth guard → JWT → repository →
  controller → DTO validation → Swagger. We copy-pasted it for years.
- **The remaining 10% is what makes the app yours.** Business rules,
  custom routes, integration with other systems. That's where time
  *should* go.

So we extracted the 90% into one library with a single contract:

```typescript
RocketsCoreModule.forRoot({
  auth: MyAuthAdapter,                              // 1. how to authenticate
  repository: defineTypeOrmRepository({ /* … */ }), // 2. where data lives
  resources: [petResource, /* … */],                // 3. what features exist
});
```

Every input is configuration. The `define*(config)` helpers
(`defineTypeOrmRepository`, `defineFirebaseAuth`, …) own the
mechanical wiring — there is no raw `TypeOrmModule.forRoot` in your
`AppModule`, no manual provider arrays, no hand-listed entities. See
[Step 2 of the tutorial](#step-2--write-your-repository-helper) for
how a helper is built.

Anything that **both** the "I want full built-in auth" use case and the
"I plug my own Firebase/Auth0" use case need — it lives in core. That
includes the auth abstraction, the CRUD planner, the dynamic repository
wiring, and Swagger registration.

---

## Designed for AI-driven code generation

This is not an accidental property — it's the **headline design goal**.
AI code-generation agents (Claude Code, Copilot, Cursor, etc.) work
best when each feature is a **single, self-contained configuration
object** that does not require cross-file context to understand.

`rockets-core` is built around that constraint:

- **One bundle = one feature.** A `defineResource()` call carries the
  entity, the DTOs, the hooks, the operations, the relations, and the
  sub-resources — all in one place. An AI agent reading `pet.resource.ts`
  has the whole `Pet` feature in front of it: no need to open the
  controller, the service, a separate module file, a routes file, a
  Swagger config, or a repository registration block.
- **No hand-wired `@Module` files per feature.** Adding a feature means
  emitting one config object and appending it to `resources[]`.
  Removing it means deleting that one object. The AI never has to
  reason about what to register where.
- **No hidden side-files.** Entities, DTOs, hooks, and providers live
  inside the bundle that needs them. There is no global "register every
  entity here" list, no top-level controller file to keep in sync. The
  AI never patches "two places to keep matching."
- **One contract per concern, no leakage.** Auth → `AuthAdapterInterface`.
  Data → `RepositoryInterface`. CRUD → `defineResource()`. Custom
  workflows → `defineModuleResource()`. The AI doesn't need to choose
  between a dozen overlapping abstractions.

**AI + declarative configuration is a strong combination.** The same
properties that make this codebase easy for humans to skim — one
source of truth per feature, predictable file layout, no scattered
`@Module()` boilerplate — make it predictable and safe for AI to extend.

If you generate a `Pet` resource, an `Appointment` resource, and a
`PetTransfer` workflow with three separate AI prompts, each prompt
can run in isolation: it writes one folder, exports one bundle,
appends one line to `resources[]`. The features can't collide with
each other and there's no global state to keep coherent.

---

## What it does — three jobs

### 1. Defines the auth contract (without implementing it)

Core declares one interface:

```typescript
interface AuthAdapterInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}
```

It does **not** care whether you verify the token with a local secret,
call Firebase Admin SDK, or talk to Auth0. You implement that interface;
core makes sure every protected route calls it.

### 2. Plans the database for you

You don't write `TypeOrmModule.forFeature([PetEntity])` per feature.
Instead, each bundle declares its own entities:

```typescript
defineResource({ key: 'pet', entity: PetEntity, path: 'pets' })
```

Core collects every entity from every bundle, calls
`RepositoryModule.forFeature(...)` once per adapter, and gives you a
dynamic repository injected by key:

```typescript
@InjectDynamicRepository('pet') private repo: RepositoryInterface<PetEntity>
```

Swap TypeORM for Firestore? Change the `repository:` field. Domain
code never moves.

### 3. Generates CRUD from descriptions, not code

You describe the resource:

```typescript
defineResource({
  entity: PetEntity,
  hooks: [OwnerStampHook.for(PetEntity)],   // optional behavior
  operations: {
    list:   { response: PetDto },
    create: { body: PetCreateDto, response: PetDto },
    delete: { soft: true, returnDeleted: true },
  },
})
```

Core produces the controller, validation pipeline, joins for relations,
Swagger schema, and the right CQRS command/query for each operation.
Adding an endpoint is appending to `resources[]`, not creating a folder
of NestJS files.

---

## What it does NOT do

| Not in core | Where it lives |
|---|---|
| `/me` endpoint | [`@bitwild/rockets`](../rockets-server/) |
| `POST /auth/signup`, `POST /auth/login` | [`@bitwild/rockets-auth`](../rockets-server-auth/) |
| OAuth, OTP, password recovery, admin pages | [`@bitwild/rockets-auth`](../rockets-server-auth/) |
| Any HTTP controller | server packages |

Why? Core is the *shared* layer. The moment it shipped a controller,
both `rockets-server` and `rockets-server-auth` would inherit that
route whether they wanted it or not. Composition stays clean when each
package owns its presentation surface.

---

## Tutorial — boot a tiny core-only app

The headline rule: **`AppModule` should contain a single `forRoot` call
that only receives configuration.** No raw `TypeOrmModule.forRoot`, no
parallel auth module, no hand-listed entities. Everything is passed
through `define*` helpers that turn configuration into the shapes core
expects.

You'll end up with:

- A bearer-token guard that runs **your** `validateToken` on every request.
- A `GET/POST/PATCH/DELETE /pets` API (no controller code).
- User-metadata stored in TypeORM, joined to the external user via `userId`.

### 1. Install

```bash
yarn add @bitwild/rockets-core \
  @concepta/nestjs-repository @concepta/nestjs-repository-typeorm \
  @nestjs/typeorm typeorm class-validator class-transformer
```

### 2. A `defineTypeOrmRepository` helper (configuration → bootstrap)

This is the **only place** in your app that mentions TypeORM. It turns
a connection config into a `RepositoryBootstrap` that owns *both* the
connection (`forRoot`) and per-entity registration (`forFeature`).
Rockets supplies the entity list — derived from `resources[]` +
`userMetadata` — so you never list entities twice.

```typescript
// src/repository/define-typeorm-repository.ts (copy once per app)
import type { DynamicModule, PlainLiteralObject, Type } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import type {
  DynamicRepositoryModule,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import type { RepositoryBootstrap } from '@bitwild/rockets-core';

export function defineTypeOrmRepository(
  connection: TypeOrmModuleOptions,
): RepositoryBootstrap {
  return {
    name: 'typeorm-bootstrap',
    forFeature: (entities: RepositoryProviderOptions[]): DynamicRepositoryModule =>
      TypeOrmRepositoryModule.forFeature(entities),
    forRoot: (entities: ReadonlyArray<Type<PlainLiteralObject>>): DynamicModule =>
      TypeOrmModule.forRoot({ ...connection, entities: [...entities] }),
  };
}
```

The convention: **for each persistence adapter you use, expose one
`define<Adapter>Repository(config)` helper** that takes connection
config in and returns a `RepositoryBootstrap`. The app's `AppModule`
keeps seeing pure configuration. Today this repo ships only the
TypeORM adapter; future adapters (Firestore, Mongo, …) would follow
the same shape.

### 3. Implement the auth adapter

```typescript
// src/auth/my-auth.adapter.ts
import { Injectable } from '@nestjs/common';
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

For self-contained adapters (no external module deps), passing the
**class** is enough — core auto-registers it as a provider and aliases
`AUTH_ADAPTER_TOKEN` to it via `useExisting`. No `providers: [MyAuthAdapter]`
step required.

For adapters that depend on an external Nest module (e.g.
`FirebaseAuthModule` registers `FirebaseAuthAdapter` alongside a
verifier provider), use `defineAuthFeature()` or a `RocketsAuthIntegration`
instead — see [How-to: auth adapters with external dependencies](#how-to-auth-adapters-with-external-dependencies).

### 4. Compose the app — one `forRoot` call, only configuration

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { RocketsCoreModule, defineResource } from '@bitwild/rockets-core';
import { UserMetadataEntity, PetEntity } from './entities';
import {
  UserMetadataCreateDto,
  UserMetadataUpdateDto,
} from './dto/user-metadata.dto';
import { MyAuthAdapter } from './auth/my-auth.adapter';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';

@Module({
  imports: [
    RocketsCoreModule.forRoot({
      // 1. Auth: the adapter class. Core auto-registers it and
      //    aliases AUTH_ADAPTER_TOKEN — no separate providers entry.
      auth: MyAuthAdapter,

      // 2. Persistence: configuration goes IN, a RepositoryBootstrap
      //    comes OUT. Rockets owns forRoot(entities) + forFeature().
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
      }),

      // 3. User-metadata table — joined to the external user via userId.
      //    `createDto` / `updateDto` are required: they implement
      //    UserMetadataCreatableInterface (`userId: string`) and
      //    UserMetadataModelUpdatableInterface (`id: string`) respectively.
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
      },

      // 4. Features. Each defineResource carries its own entity.
      resources: [
        defineResource({ entity: PetEntity }), // key/path/tags inferred
      ],
    }),
  ],
})
export class AppModule {}
```

**There is no `TypeOrmModule.forRoot` here.** There is no parallel auth
module. There is no `providers: [MyAuthAdapter]` either — `auth: MyAuthAdapter`
covers it. The `AppModule` only contains *configuration* — every
mechanical detail is owned by a `define*` helper.

### 5. Run

```bash
nest start
```

You now have `GET /pets`, `GET /pets/:id`, `POST /pets`, `PATCH /pets/:id`,
`DELETE /pets/:id`, every route protected by your bearer-token check, and
Swagger at `/api`. If you also want `GET /me` and a global guard
pre-wired (the default for external-auth apps), jump to
[`@bitwild/rockets`](../rockets-server/).

---

## How-to guides

### Add a CRUD feature

CRUD-shaped (auto-generates a controller):

```typescript
defineResource({ key: 'pet', entity: PetEntity, path: 'pets' })
```

Just a table (no controller) or a feature with your own controllers
and services — use `defineModuleResource` with the **flat shape**:

```typescript
// Entity-only (junction table, supporting data)
defineModuleResource({
  entities: [PetTagEntity],
});

// Entity + controller + service
defineModuleResource({
  entities: [PetShareEntity],
  controllers: [PetShareController],
  providers: [PetShareService],
  exports: [PetShareService],   // only what other bundles inject
});

// CQRS-only workflow (uses an entity owned elsewhere)
defineModuleResource({
  imports: [CqrsModule],
  controllers: [PetTransferController],
  providers: [TransferPetOwnershipHandler],
});
```

### Inject a dynamic repository

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

  findByOwner(ownerId: string) {
    return this.petRepo.find({ where: Where.eq<PetEntity>('userId', ownerId) });
  }
}
```

The string key (`'pet'`) is the same one in `defineResource({ key: 'pet', … })`
or the entity's name with the trailing `Entity` stripped if you let it
infer.

### Access the authenticated user inside a CRUD handler

```typescript
import { getActor, getCrudContext } from '@bitwild/rockets-core';

@CommandHandler(CrudCreateCommand)
export class PetCreateHandler {
  async execute(cmd: CrudCreateCommand) {
    const actor = getActor(cmd.context);
    // actor.id, actor.email, actor.userRoles
  }
}
```

No parameter drilling, no decorators on the auto-generated controller.

### Scope rows to the current user

`OwnerStampHook` stamps `userId` on create/update; `OwnerScopeHook`
filters list/read/update/delete by `userId`. Both are **factories**:

```typescript
import { OwnerStampHook, OwnerScopeHook } from '@bitwild/rockets-core';

defineResource({
  entity: PetEntity,
  hooks: [
    OwnerStampHook.for(PetEntity),   // write-side
    OwnerScopeHook.for(PetEntity),   // read-side
  ],
});
```

Both default to a `userId` column; pass a second argument to override.

### Use a non-TypeORM persistence adapter

The `repository:` field accepts any value implementing
`RepositoryModuleInterface` (`forFeature(entities)`) or
`RepositoryBootstrap` (which also owns `forRoot(entities)`).

The convention going forward is the same `define<Adapter>Repository(config)`
factory pattern shown in [Step 2 of the tutorial](#step-2--write-your-repository-helper):
the helper accepts configuration and returns a `RepositoryBootstrap`.
Domain code talks to `RepositoryInterface` only, so swapping adapters
is one line.

> Today the only first-party adapter in this repo is TypeORM
> (`@concepta/nestjs-repository-typeorm`). When other adapters ship
> (Firestore, Mongo, …), each will follow the same factory shape and
> drop into `repository:` without changes elsewhere in the app.

### Mix two stores in one app

The `entities` row inside `defineModuleResource` accepts a per-entity
`repository:` override that takes precedence over the default
adapter:

```typescript
RocketsCoreModule.forRoot({
  repository: defineTypeOrmRepository({ /* … */ }),    // default for everything
  resources: [
    defineResource({ entity: PetEntity }),             // → default (TypeORM)
    defineModuleResource({
      entities: [{
        key: 'analytics-event',
        entity: AnalyticsEventEntity,
        repository: defineOtherAdapter({ /* … */ }),   // per-entity override
      }],
    }),
  ],
});
```

The default bootstrap owns its entity set; the override-only entities
go to the override's bootstrap. Each adapter sees only the entities
it should. The override accepts any `RepositoryModuleInterface` or
`RepositoryBootstrap`.

### How-to: auth adapters with external dependencies

Some adapters (`FirebaseAuthAdapter`, OAuth providers, …) ship their
**own Nest module** that provides the adapter alongside its
dependencies (a token verifier, an HTTP client, options tokens). If
core tried to instantiate that class a second time inside its own
scope, those dependencies wouldn't be reachable — boot fails with
`Nest can't resolve dependencies`.

`RocketsCoreModule` accepts a bare `Type<AuthAdapterInterface>` only.
For an adapter that's externally provided, do two things:

1. Import the adapter's owning module into your `AppModule` (or have
   `RocketsCoreModule.forRoot` do it via a `defineModuleResource` in
   `resources[]`).
2. Pass `auth: TheAdapterClass` AND `authExternallyProvided: true`
   so core skips its own `providers.push(adapterClass)` and only
   aliases `AUTH_ADAPTER_TOKEN` via `useExisting`.

```typescript
import * as admin from 'firebase-admin';
import { Module } from '@nestjs/common';
import {
  RocketsCoreModule,
  defineModuleResource,
  defineResource,
} from '@bitwild/rockets-core';
import {
  FirebaseAuthAdapter,
  FirebaseAuthModule,
} from '@bitwild/rockets-adapter-firebase';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';
import { UserMetadataEntity } from './user-metadata.entity';
import { PetEntity } from './pet.entity';

const firebaseApp = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

@Module({
  imports: [
    RocketsCoreModule.forRoot({
      auth: FirebaseAuthAdapter,
      authExternallyProvided: true,             // ← critical
      repository: defineTypeOrmRepository({ /* … */ }),
      userMetadata: { entity: UserMetadataEntity },
      resources: [
        // Mount the adapter's owning module via a module resource so
        // Rockets can re-export it globally. FirebaseAuthModule must
        // be global (or imported wherever AUTH_ADAPTER_TOKEN is
        // resolved) for the `useExisting` alias to find it.
        defineModuleResource({
          imports: [FirebaseAuthModule.forRoot({ firebaseApp })],
        }),
        defineResource({ entity: PetEntity }),
      ],
    }),
  ],
})
export class AppModule {}
```

> **If you're using `@bitwild/rockets` (the server package), there's a
> cleaner option:** `RocketsModule.forRoot` also accepts a
> `RocketsAuthIntegration` for `auth:`, which packages the
> external-module import + `authExternallyProvided` flag + entity
> registration into one `defineXxxAuth(config)` helper. See
> [`packages/rockets-server/README.md#how-to-auth-adapters-with-external-dependencies`](../rockets-server/README.md#how-to-auth-adapters-with-external-dependencies).
> Core directly only knows about `Type<AuthAdapterInterface>` + the
> `authExternallyProvided` flag — the helper-shape sugar lives in the
> server package.

---

## Reference

### `RocketsCoreModule.forRoot(options)` / `forRootAsync(asyncOptions)`

| Field | Type | Required | What it does |
|---|---|---|---|
| `auth` | `Type<AuthAdapterInterface>` | optional† | Adapter class. Core auto-registers it as a provider AND aliases `AUTH_ADAPTER_TOKEN` to it via `useExisting`. |
| `authExternallyProvided` | `boolean` (default `false`) | optional | Set `true` when the adapter class is already a provider in an external Nest module (e.g. `FirebaseAuthModule`). Core skips its own registration and just aliases the token. |
| `repository` | `RepositoryModuleInterface \| RepositoryBootstrap` | optional | Default persistence adapter. A `RepositoryBootstrap` owns *both* the connection (`forRoot(entities)`) and per-entity registration (`forFeature`) — use this so you never list entities at the app root. |
| `userMetadata` | `RocketsUserMetadataConfig` | optional | Entity + DTOs for the metadata table that joins to external users. |
| `resources` | `ReadonlyArray<ResourceInput>` | optional | A mix of `defineResource`, `defineModuleResource`, and hand-built configs. |
| `handlers` | `{ upsertUserMetadata?, getUserMetadata? }` | optional | Override the default metadata CQRS handlers. |
| `providers` | `Provider[]` | optional | Extra providers to register on `RocketsCoreModule`. |
| `global` | `boolean` (default `true`) | optional | Module is global — its exports are app-wide. |

† Required at the layer that exposes endpoints (e.g. `RocketsModule` always
needs an auth source). Core itself will boot without it for tests.

### `defineResource(input)` — CRUD bundle

| Field | What it does |
|---|---|
| `entity` | Entity class. Auto-registers the persistence row. |
| `key` | Repository key (defaults to entity name minus `Entity`, lowercase first char). |
| `path` | URL path (defaults to plural kebab-case of the key). |
| `tags` | Swagger tags (default derived from key). |
| `dto` | `{ response, create, update, replace, paginated }` DTOs. |
| `operations` | `{ list, read, create, update, replace, delete, restore }` per-op config. |
| `relations` | `(rel) => [rel(TagEntity, 'tags')]` — type-safe cross-resource relations. |
| `hooks` | Repository hooks (owner scoping, audit, etc.). |
| `subResources` | Nested resources (e.g. `/pets/:petId/tags`). |
| `public` | If `true`, skip the bearer-auth decorator on this resource. |
| `decorators` | Extra class-level decorators on the generated controller. |

### `defineModuleResource(input)` — non-CRUD bundle

**Flat shape** (no nested `module:` key):

| Field | What it does |
|---|---|
| `entities` | Persistence rows. Bare class or `{ key, entity, repository? }`. Optional. |
| `imports` | Nest module imports for this feature. |
| `controllers` | Nest controllers for this feature. |
| `providers` | Nest providers. |
| `exports` | Public surface — globally visible (see [explanation](#feature-exports-are-globally-visible)). |

### `AuthAdapterInterface`

```typescript
interface AuthAdapterInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}

interface AuthorizedUser {
  id: string;
  sub: string;
  email?: string;
  userRoles?: { role: { name: string } }[];   // drives RBAC
  claims?: Record<string, unknown>;            // free-form IdP payload
}
```

### Helpers (most used)

| Symbol | Purpose |
|---|---|
| `defineResource()` | CRUD bundle. |
| `defineModuleResource()` | Non-CRUD bundle (entities + Nest wiring). |
| `defineSubResource()` | Nested resource (1 level under a parent). |
| `defineAuthFeature()` | Auth adapter + entities + auth controllers in one bundle. |
| `relation(target, prop, opts?)` | Type-safe cross-resource relation. |
| `getActor(ctx)` | Read the authenticated user from a CRUD context. |
| `getCrudContext(ctx)` | Read the full CRUD context (request, params, …). |
| `OwnerStampHook.for(Entity)` | Stamp `userId` on create/update. |
| `OwnerScopeHook.for(Entity)` | Filter list/read/update/delete by `userId`. |
| `AfterCreateReloadHook.for(Entity)` | Reload an entity after create (eager relations). |
| `PathScopeHook.for(Entity, paramName, fkColumn)` | Filter sub-resource by parent URL param. |
| `PathScopeGuard.for(paramName, parentKey, ownerColumn)` | Verify actor owns the parent. |
| `AuthServerGuard` | Bearer-token guard. Server packages opt-in via `APP_GUARD`. |
| `@AuthPublic()` | Mark a route as not requiring auth. |
| `AUTH_ADAPTER_TOKEN` | Inject the configured adapter (`@Inject(AUTH_ADAPTER_TOKEN)`). |

---

## Explanation

### Why core has no controllers

Both `@bitwild/rockets` and `@bitwild/rockets-auth` build on core. If
core shipped `MeController`, every consumer would get it whether the
app's product surface called for it or not. Presentation lives in
server packages so each composition stays focused.

### Feature exports are globally visible

`RocketsCoreModule` is a global Nest module. Anything a
`defineModuleResource` puts in `exports: [...]` becomes injectable from
**anywhere** in the app. That's powerful (an outer `useFactory` can
inject a provider buried in a feature) and dangerous (two features
exporting `Logger` collide silently).

**Rule:** only export what other bundles or outer factories actually
inject. Internal helpers stay in `providers:` without `exports`. Use
prefixed names (`BillingPriceFormatter`) or injection tokens
(`BILLING_TOKEN`) when collisions are likely.

### Why one root `repository` + bundles owning their own entities

Earlier versions used a single flat `entities: [...]` block at the
root. It worked, but:

- Entities lived in a list disconnected from the feature that needed them.
- Moving a feature meant editing two places (the feature folder *and*
  the root list).

Today the rule is: **one default adapter** at the top
(`repository: defineTypeOrmRepository({...})` or any other
`RepositoryBootstrap`), and **every entity comes from a bundle**.
Need a mixed store? Set `repository:` per entity inside the bundle.
Moving a feature = moving the folder.

### Architecture

```text
rockets-common         shared utils, zero framework opinion
rockets-repository     abstract data access (no TypeORM, no Firestore)
rockets-crud           generic CRUD generator
rockets-access-control ACL/RBAC primitives
    ▲
rockets-core           ◀── THIS PACKAGE (auth abstraction, planner, hooks)
    ▲
rockets-server         external-auth composition root (/me + global guard)
rockets-server-auth    built-in auth (signup, login, OAuth, OTP, admin)
```

---

## License

BSD-3-Clause — see [`../../LICENSE.txt`](../../LICENSE.txt).
