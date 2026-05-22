# `@bitwild/rockets`

[![NPM Latest](https://img.shields.io/npm/v/@bitwild/rockets)](https://www.npmjs.com/package/@bitwild/rockets)
[![CI](https://img.shields.io/github/actions/workflow/status/btwld/rockets/ci-merge.yml?branch=main&label=CI)](https://github.com/btwld/rockets/actions/workflows/ci-merge.yml)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![License](https://img.shields.io/npm/l/@bitwild/rockets)](https://github.com/btwld/rockets/blob/main/LICENSE.txt)

**Bring your own auth.** Your users live in Firebase, Auth0, Cognito,
or your company's IdP. You don't want to rebuild signup/login — you
want to validate their tokens, store app-specific data about them, and
ship a CRUD API on top. That's what this package does.

> Pre-1.0: API is `1.0.0-alpha.7`. Surface is stable; minor field
> renames may still happen before 1.0. Pin exact versions in production.

---

## Table of contents

- [The problem this package solves](#the-problem-this-package-solves)
- [What you get out of the box](#what-you-get-out-of-the-box)
- [Designed for AI-driven code generation](#designed-for-ai-driven-code-generation)
- [How `@bitwild/rockets` builds on `@bitwild/rockets-core`](#how-bitwildrockets-builds-on-bitwildrockets-core)
- [Prerequisites](#prerequisites)
- [Install](#install)
- [Step 1 — implement the auth adapter](#step-1--implement-the-auth-adapter)
- [Step 2 — define the user-metadata entity](#step-2--define-the-user-metadata-entity)
- [Step 3 — set up the repository bootstrap](#step-3--set-up-the-repository-bootstrap)
- [Step 4 — declare a CRUD feature](#step-4--declare-a-crud-feature)
- [Step 5 — compose the app module](#step-5--compose-the-app-module)
- [What just happened (the wiring, expanded)](#what-just-happened-the-wiring-expanded)
- [Cookbook](#cookbook)
- [The three `auth` shapes — when to use which](#the-three-auth-shapes--when-to-use-which)
- [Reference](#reference)
- [Troubleshooting](#troubleshooting)
- [Production checklist](#production-checklist)
- [License](#license)

---

## The problem this package solves

You have an external Identity Provider (Firebase / Auth0 / Cognito /
your enterprise SSO). Clients sign in there and arrive at your backend
with a bearer token. Your backend has to:

1. Verify that token on every request.
2. Resolve "who is this?" to an internal user shape (`id`, `email`,
   roles, claims).
3. Look up or create app-specific fields about that user (preferences,
   plan, onboarding state) — joined by external user id.
4. Run a CRUD API for your domain (`Pet`, `Appointment`, …) where each
   user only sees their own rows.
5. Document every route in Swagger.

In plain NestJS you'd write a guard, a JWT/JWK verifier, a
`/me` controller, a `TypeOrmModule.forRoot({ entities: [...] })`, a
controller per resource, hooks for owner scoping, DTOs with Swagger
decorators, and the same Swagger setup again — for every project.

`@bitwild/rockets` reduces that to: **one adapter class + one
`forRoot` call**.

---

## What you get out of the box

- A global bearer-token guard. Every route is protected by default;
  opt out per-route with `@AuthPublic()`.
- A built-in `GET/PATCH /me` endpoint that merges your external user
  with the local metadata row.
- Declarative CRUD — `defineResource()` generates the controller, the
  validation pipeline, joins, Swagger schema, soft-delete + restore.
- Non-CRUD features in the same wiring channel — `defineModuleResource()`
  for service+controller or CQRS-only bundles.
- Owner scoping as a one-liner — `OwnerStampHook.for(Entity)` writes
  the actor id, `OwnerScopeHook.for(Entity)` filters reads.
- Sub-resources with path-scoped guards — `defineSubResource()`
  produces `/parents/:parentId/children` with parent-ownership checks
  baked in.
- Swagger UI at `/api`, derived from your DTOs and resource definitions.
- Database-agnostic by contract — domain code talks to
  `RepositoryInterface`, the adapter is pluggable (TypeORM today,
  Firestore / Mongo / custom anywhere).

You do **not** write: a JWT guard, an HTTP `/me` controller, per-entity
`TypeOrmModule.forFeature(...)`, a CRUD controller, owner-scoping
guards, or Swagger boilerplate.

---

## Designed for AI-driven code generation

This is not an accidental property — it's the **headline design goal**
of the whole Rockets stack. AI code-generation agents (Claude Code,
Copilot, Cursor, …) work best when each feature is a **single
self-contained configuration object** that does not require
cross-file context to understand or extend.

`@bitwild/rockets` doubles down on that constraint:

- **One bundle = one feature.** Every `defineResource()` /
  `defineModuleResource()` call carries everything the feature needs:
  entity, DTOs, hooks, operations, sub-resources, controllers,
  providers, exports. An AI agent reading `pet.resource.ts` has the
  *entire* Pet feature in front of it — no jumping to a controller
  file, a service file, a separate module, a routes file, a Swagger
  config, or a global entity-registration list.
- **Adding a feature is one config object + one line.** No `@Module`
  scaffolding, no `TypeOrmModule.forFeature(...)`, no controller class,
  no DTO of decorators applied to the route. The AI emits one bundle
  and appends it to `resources[]` — that's the whole change.
- **Removing a feature is symmetric.** Delete the folder, delete one
  line from `resources[]`. No global lists drift out of sync. No
  orphaned `@Module` imports left in `AppModule`.
- **Stable, narrow contracts.** Auth is one interface
  (`AuthAdapterInterface`). Data is one interface
  (`RepositoryInterface`). CRUD is one helper (`defineResource`).
  An AI doesn't have to pick between five overlapping abstractions
  or read the framework source to understand what shape to emit.
- **Predictable file layout.** Feature folder contains the bundle,
  the entity, the DTOs, the hooks specific to that feature. Anything
  outside that folder is genuinely shared. There are no
  "remember-to-also-update" lists scattered across the app.

**AI + declarative configuration is a strong combination.** The same
properties that make this codebase easy for a human to skim — one
source of truth per feature, predictable folder structure, no
scattered `@Module()` boilerplate — make it safe and predictable for
AI to extend at scale. Generate a `Pet` resource, an `Appointment`
resource, and a `PetTransfer` workflow with three independent prompts:
each prompt writes one folder, exports one bundle, appends one line.
The generations cannot collide and require no global coordination.

---

## How `@bitwild/rockets` builds on `@bitwild/rockets-core`

The actual engine — the auth abstraction, the resource planner, the
dynamic repository wiring, the CQRS handlers, the Swagger registration —
lives in [`@bitwild/rockets-core`](../rockets-core/). Core has **no
controllers**: it can't, because both this package and
`@bitwild/rockets-auth` build on it and would inherit anything core
exposed.

`@bitwild/rockets` is the **thin composition layer** that adds the parts
unique to the external-auth path:

| Adds to core | What it does |
|---|---|
| `MeController` (`GET/PATCH /me`) | Returns external user + local metadata; updates metadata. |
| `APP_GUARD → AuthServerGuard` (opt-in default) | Every route is auth-protected unless explicitly `@AuthPublic()`. |
| Composition surface (`RocketsModule.forRoot`) | Forwards `auth`, `repository`, `userMetadata`, `resources` to core; accepts three `auth` shapes. |

Everything else — the `defineResource` you call, the
`AUTH_ADAPTER_TOKEN` you inject, the `OwnerStampHook` you attach — is
**re-exported from core**. You import most of it from
`@bitwild/rockets`; the hooks and `getActor` you import directly from
`@bitwild/rockets-core`. Either way, it's the same code.

```text
your app
   │
   ▼
@bitwild/rockets             ← /me + global guard + composition root
   │   adds these:           ────────────────────────────────────
   │     MeController                                            
   │     APP_GUARD → AuthServerGuard (opt-in)                    
   │     RocketsModule.forRoot()                                 
   ▼
@bitwild/rockets-core        ← engine (no controllers)
       AuthAdapterInterface                                       
       Resource planner (defineResource, defineModuleResource)    
       Dynamic repository wiring                                  
       CQRS handlers, Swagger registration, hooks                 
       OwnerStampHook, OwnerScopeHook, PathScopeHook, …          
```

**Why split it?** Because the same engine has to serve
`@bitwild/rockets-auth` (Rockets owns the user table) and this package
(an external IdP owns the user table). Putting the `/me` route in core
would force the built-in-auth package to ship that route too, even
when its own `/me` is shaped differently. Each composition stays focused.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node | ≥ 18 |
| NestJS | ^11 |
| TypeScript | ≥ 5 |
| Class transformer / validator | latest |

The `@nestjs/swagger` CLI plugin is **not** enabled. Every DTO field
you want in Swagger needs `@ApiProperty()` or `@ApiPropertyOptional()`
explicitly — type inference is not enough.

---

## Install

```bash
yarn add @bitwild/rockets @bitwild/rockets-core \
  @concepta/nestjs-repository-typeorm \
  @nestjs/typeorm typeorm \
  class-transformer class-validator @nestjs/swagger
```

The next five steps are a complete app — no external example required.

---

## Step 1 — implement the auth adapter

The adapter is the **only place** that knows about your IdP. It
implements one method.

For this tutorial we'll use a **self-contained JWT adapter** — it has
no external Nest module dependencies, only the `jsonwebtoken` library.
That keeps `auth: MyAuthAdapter` as the simplest possible wiring.

```typescript
// src/auth/my-auth.adapter.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import type {
  AuthAdapterInterface,
  AuthorizedUser,
} from '@bitwild/rockets-core';

@Injectable()
export class MyAuthAdapter implements AuthAdapterInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    let payload: { sub: string; email?: string; roles?: string[] };
    try {
      payload = verify(token, process.env.JWT_SECRET!) as typeof payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
    return {
      id: payload.sub,
      sub: payload.sub,
      email: payload.email,
      // userRoles MUST follow this shape — the bearer guard reads `.role.name`
      userRoles: (payload.roles ?? []).map((name) => ({ role: { name } })),
      claims: payload,
    };
  }
}
```

That's the entire IdP integration. Whether the token came from
Auth0, your enterprise SSO, or an in-process JWT issuer is invisible
to the rest of the app — the adapter normalizes everything into
`AuthorizedUser`.

> **Using Firebase, Auth0, Okta, or another IdP that ships its own
> Nest module?** Don't paste their adapter class into `auth:`
> directly — those adapters depend on tokens/providers that only
> resolve when the IdP's module is also mounted. Use the
> `defineXxxAuth(config)` pattern instead. See
> [How-to: auth adapters with external dependencies](#how-to-auth-adapters-with-external-dependencies-firebase-oauth-).

---

## Step 2 — define the user-metadata entity

External IdPs own identity (id, email, roles). Your app still needs to
store its **own** fields about the user — display name, plan,
onboarding state, preferences. That's the *metadata* table.

The entity must implement `BaseUserMetadataEntityInterface` — `id`
(local primary key), `userId` (FK to the external user), and the
date/version fields. Rockets fills the dates and version on the
repository layer.

```typescript
// src/users/user-metadata.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { BaseUserMetadataEntityInterface } from '@bitwild/rockets-core';

@Entity('user_metadata')
export class UserMetadataEntity implements BaseUserMetadataEntityInterface {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() userId!: string;                       // matches AuthorizedUser.id
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
  @Column({ type: 'datetime', nullable: true }) dateDeleted!: Date | null;
  @Column({ type: 'int', default: 1 }) version!: number;

  // Your own fields
  @Column({ nullable: true }) displayName?: string;
  @Column({ default: false }) onboardingComplete!: boolean;
}
```

The DTOs implement two interfaces with specific required fields:

- `UserMetadataCreatableInterface` — requires `userId: string`.
- `UserMetadataModelUpdatableInterface` — requires `id: string`.

```typescript
// src/users/user-metadata.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';

export class UserMetadataCreateDto implements UserMetadataCreatableInterface {
  @ApiProperty() @IsString() @IsNotEmpty() userId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() displayName?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onboardingComplete?: boolean;
}

export class UserMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @ApiProperty() @IsString() @IsNotEmpty() id!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() displayName?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() onboardingComplete?: boolean;
}
```

`GET /me` returns `{ user: AuthorizedUser, metadata: UserMetadataEntity }`.
`PATCH /me` validates against `UserMetadataUpdateDto` and upserts.

---

## Step 3 — set up the repository bootstrap

A `RepositoryBootstrap` owns **both** the database connection
(`forRoot(entities)`) and per-entity registration (`forFeature(entities)`).
Rockets collects every entity from `resources[]` + `userMetadata` and
passes the full list in automatically — so you never list entities
twice.

```typescript
// src/repository/define-typeorm-repository.ts
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

This is ~15 lines you'll copy into every app once. After this, **no
`TypeOrmModule.forRoot({ entities })` ever again** — Rockets owns the
entity list.

---

## Step 4 — declare a CRUD feature

`defineResource` is the headline API. You describe the resource; the
framework produces the controller.

```typescript
// src/pets/pet.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, DeleteDateColumn } from 'typeorm';

@Entity('pets')
export class PetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() userId!: string;           // owner — stamped by OwnerStampHook
  @Column() name!: string;
  @Column({ nullable: true }) species?: string;
  @DeleteDateColumn() dateDeleted?: Date;
}
```

```typescript
// src/pets/pet.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class PetResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional() species?: string;
}
export class PetCreateDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() species?: string;
}
export class PetUpdateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() species?: string;
}
```

```typescript
// src/pets/pet.resource.ts
import { defineResource } from '@bitwild/rockets';
import { OwnerStampHook, OwnerScopeHook } from '@bitwild/rockets-core';
import { PetEntity } from './pet.entity';
import { PetCreateDto, PetUpdateDto, PetResponseDto } from './pet.dto';

export const petResource = defineResource({
  entity: PetEntity,
  // key 'pet', path 'pets', tags ['Pets'] inferred from the entity name
  hooks: [
    OwnerStampHook.for(PetEntity),   // stamp userId on write; reject spoofing
    OwnerScopeHook.for(PetEntity),   // filter list/read/update/delete by userId
  ],
  operations: {
    list:   { response: PetResponseDto },
    read:   { response: PetResponseDto },
    create: { body: PetCreateDto, response: PetResponseDto },
    update: { body: PetUpdateDto, response: PetResponseDto },
    delete: { soft: true, returnDeleted: true },
    restore: { returnRestored: true },
  },
});
```

What this single declaration produces:

- `GET /pets`, `GET /pets/:id`, `POST /pets`, `PATCH /pets/:id`,
  `DELETE /pets/:id` (soft), `PUT /pets/:id/restore`
- Validation against `PetCreateDto` / `PetUpdateDto`
- Swagger schema for every route
- An injectable repository: `@InjectDynamicRepository('pet')`
- Owner stamping on create + reject on update if `userId` mismatches actor
- Owner scoping on every read — no leaked rows
- A soft-delete column populated on `DELETE`; restore endpoint reverses it

Zero controller code. The full file is shown above.

---

## Step 5 — compose the app module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { RocketsModule } from '@bitwild/rockets';
import { MyAuthAdapter } from './auth/my-auth.adapter';
import { UserMetadataEntity } from './users/user-metadata.entity';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './users/user-metadata.dto';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';
import { petResource } from './pets/pet.resource';

@Module({
  imports: [
    RocketsModule.forRoot({
      // 1. Auth: just the class. Rockets auto-registers it as a
      //    provider AND aliases AUTH_ADAPTER_TOKEN to it via useExisting.
      //    Works because MyAuthAdapter is self-contained (Step 1).
      //    For adapters with external Nest module dependencies
      //    (Firebase, Auth0, …), use defineXxxAuth(config) instead —
      //    see the cookbook recipe below.
      auth: MyAuthAdapter,

      // 2. Persistence: configuration goes IN, RepositoryBootstrap
      //    comes OUT. Rockets owns the entity list AND the connection.
      //    There is no TypeOrmModule.forRoot anywhere in the app.
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,             // dev only
      }),

      // 3. User-metadata table — joined to the external user via userId.
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
      },

      // 4. Features. Each bundle carries its own entity, DTOs, hooks.
      resources: [
        petResource,
      ],
    }),
  ],
})
export class AppModule {}
```

That's the whole app. Boot it:

```bash
nest start
# → http://localhost:3000
# → Swagger at http://localhost:3000/api
```

**`AppModule` only contains configuration.** Every mechanical detail —
guard registration, entity registration, controller generation, Swagger
setup — is owned by a `define*` helper. Adding another feature is
appending one bundle to `resources[]`.

---

## What just happened (the wiring, expanded)

`RocketsModule.forRoot({ … })` runs this plan at boot:

```text
RocketsModule
└── RocketsCoreModule                            ← forwarded from RocketsModule
    │
    ├── 1. Planner sweeps resources[] + userMetadata for entity list
    │      pet, user_metadata
    │
    ├── 2. RepositoryModule.forRoot(planner.entityList)        ← from RepositoryBootstrap
    │      TypeOrmModule.forRoot({ ...connection, entities: [PetEntity, UserMetadataEntity] })
    │
    ├── 3. RepositoryModule.forFeature(...) per adapter group
    │      one dynamic-repo per key: 'pet', 'user-metadata'
    │
    ├── 4. Materialised DynamicModule per defineModuleResource
    │      authProviderFeature → FirebaseAuthAdapter as provider+export
    │
    ├── 5. CrudModule.forFeature() per defineResource
    │      pets → controller + handlers + validation pipeline
    │
    ├── 6. Provider: AUTH_ADAPTER_TOKEN aliased to FirebaseAuthAdapter
    │      (useExisting, so the same singleton answers @Inject(AUTH_ADAPTER_TOKEN))
    │
    └── 7. Swagger registration on /api with every resource's tags
│
├── controllers: [MeController]                 ← added by RocketsModule
└── providers: [APP_GUARD → AuthServerGuard]    ← added by RocketsModule
       │
       └── on every request:
           1. Reads Authorization: Bearer <token>
           2. Calls FirebaseAuthAdapter.validateToken(token)
           3. Attaches AuthorizedUser to the request
           4. Skips routes marked @AuthPublic()
```

The take-away: **`RocketsModule` is ~150 lines of glue**. The bulk of
the work happens in `RocketsCoreModule`, which both this package and
`@bitwild/rockets-auth` share.

---

## Cookbook

### Add a non-CRUD feature (service + controller)

```typescript
// src/billing/billing.feature.ts
import { defineModuleResource } from '@bitwild/rockets';
import { InvoiceEntity } from './invoice.entity';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

export const billingFeature = defineModuleResource({
  entities: [InvoiceEntity],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],   // only what other bundles need to inject
});
```

Add `billingFeature` to `resources[]`. Done.

### Add a sub-resource (`/pets/:petId/tags`)

```typescript
import { defineResource, defineSubResource } from '@bitwild/rockets';

export const petResource = defineResource({
  entity: PetEntity,
  subResources: {
    petTags: defineSubResource({
      entity: PetTagEntity,
      urlSegment: 'tags',
      parentOwnerColumn: 'userId',   // required — guards against silent 404
      operations: {
        list:   { response: PetTagResponseDto },
        create: { body: PetTagCreateDto, response: PetTagResponseDto },
        delete: {},
      },
    }),
  },
});
```

`defineSubResource` auto-injects: `PathScopeHook` (filters by `:petId`
and stamps the FK on create), `PathScopeGuard` (verifies the actor
owns the parent pet), parent `@ApiParam` on every operation. Opt out
of the guard with `disablePathScopeGuard: true` (only for intentionally
public parents).

### Inject a dynamic repository

```typescript
import { Injectable } from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { PetEntity } from './pet.entity';

@Injectable()
export class PetReportService {
  constructor(
    @InjectDynamicRepository('pet')
    private readonly petRepo: RepositoryInterface<PetEntity>,
  ) {}

  async countByOwner(ownerId: string) {
    return this.petRepo.count({
      where: Where.eq<PetEntity>('userId', ownerId),
    });
  }
}
```

The string key (`'pet'`) is the same one inferred from `PetEntity` (or
explicitly set on `defineResource({ key: 'pet', … })`).

### Mark a route as public

```typescript
import { Controller, Get } from '@nestjs/common';
import { AuthPublic } from '@bitwild/rockets';

@Controller('health')
export class HealthController {
  @Get()
  @AuthPublic()
  ok() { return { status: 'ok' }; }
}
```

The global `AuthServerGuard` skips routes tagged with `@AuthPublic`.

### Access the authenticated user

```typescript
// In a custom controller:
import { Controller, Get } from '@nestjs/common';
import { AuthUser } from '@concepta/nestjs-authentication';
import type { AuthorizedUser } from '@bitwild/rockets';

@Controller('profile')
export class ProfileController {
  @Get()
  me(@AuthUser() user: AuthorizedUser) { return user; }
}

// In a CRUD command/query handler:
import { CommandHandler } from '@nestjs/cqrs';
import { getActor } from '@bitwild/rockets-core';

@CommandHandler(CrudCreateCommand)
export class PetCreateHandler {
  execute(cmd: CrudCreateCommand) {
    const actor = getActor(cmd.context);   // { id, email, userRoles, … }
  }
}
```

### Owner scoping without writing a guard

```typescript
import { OwnerStampHook, OwnerScopeHook } from '@bitwild/rockets-core';

defineResource({
  entity: PetEntity,
  hooks: [
    OwnerStampHook.for(PetEntity),   // create/update: stamp userId, reject spoofing
    OwnerScopeHook.for(PetEntity),   // list/read/update/delete: filter by userId
  ],
});
```

Both default to a `userId` column; pass the column name as the second
argument to override (`OwnerStampHook.for(PetEntity, 'ownerId')`). Hooks
run at the repository layer, so direct (non-HTTP) calls are scoped too.

### Swap TypeORM for another adapter

The `repository:` field accepts any `RepositoryModuleInterface` (just
`forFeature(entities)`) or `RepositoryBootstrap` (also owns
`forRoot(entities)`). The convention for any future adapter is the
same `define<Adapter>Repository(config) → RepositoryBootstrap`
factory pattern shown in Step 3.

Today the only adapter shipped in this repo is TypeORM
(`@concepta/nestjs-repository-typeorm`). When another adapter ships
(Firestore, Mongo, etc.), its package will export a matching
`define<Adapter>Repository(config)` helper and the only change in
your `AppModule` is the import line and the connection config.

Domain code depends on `RepositoryInterface` (from
`@bitwild/rockets-repository` / `@concepta/nestjs-repository`), never
on the underlying SDK — that's what makes the swap a one-line change.

Mixed stores in one app: pass per-entity `repository:` inside
`defineModuleResource({ entities: [{ key, entity, repository }] })`.

### How-to: auth adapters with external dependencies (Firebase, OAuth, …)

If your adapter ships its own Nest module that provides the adapter
*along with* its dependencies (a token verifier, an HTTP client, an
options token), the `auth: AdapterClass` shorthand will fail —
Rockets would try to re-instantiate the class in its own scope where
the external dependencies are unreachable.

The fix: wrap the integration in a `define<Adapter>Auth(config)`
helper that returns a `RocketsAuthIntegration`. The helper imports
the adapter's Nest module, references the adapter class, and tells
Rockets the class is externally managed. Then pass *the helper's
result* to `auth:`.

Concrete example with `@bitwild/rockets-adapter-firebase` (the only
external-IdP adapter currently shipped in this repo). The helper
below lives in your app:

```typescript
// src/auth/define-firebase-auth.ts
import {
  FirebaseAuthAdapter,
  FirebaseAuthModule,
  FirebaseTokenVerifierInterface,
} from '@bitwild/rockets-adapter-firebase';
import { ROCKETS_AUTH_INTEGRATION_KIND } from '@bitwild/rockets-core';
import type { RocketsAuthIntegration } from '@bitwild/rockets-core';
import type { Type } from '@nestjs/common';

/**
 * Two ways to configure the verifier (one is required):
 *  - `firebaseApp`: an initialized `admin.app.App` instance from
 *    `firebase-admin`. Rockets wraps it with the default verifier
 *    service. This is the common case.
 *  - `verifier`: your own class implementing
 *    `FirebaseTokenVerifierInterface`. Use when you manage
 *    `firebase-admin` lifecycle elsewhere or need custom logic.
 */
export interface DefineFirebaseAuthConfig {
  readonly firebaseApp?: unknown;
  readonly verifier?: Type<FirebaseTokenVerifierInterface>;
}

export function defineFirebaseAuth(
  config: DefineFirebaseAuthConfig,
): RocketsAuthIntegration {
  return {
    kind: ROCKETS_AUTH_INTEGRATION_KIND,
    nestImports: [
      FirebaseAuthModule.forRoot({
        firebaseApp: config.firebaseApp,
        verifier: config.verifier,
      }),
    ],
    authAdapter: FirebaseAuthAdapter,
    // FirebaseAuthModule already provides the adapter — Rockets must
    // NOT double-register it (would create a second instance with
    // unresolvable dependencies).
    authProviderExternallyManaged: true,
    resources: [],
  };
}
```

Wire it in `AppModule` the same way as the simple case — only the
`auth:` field changes:

```typescript
import * as admin from 'firebase-admin';
import { defineFirebaseAuth } from './auth/define-firebase-auth';

const firebaseApp = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

@Module({
  imports: [
    RocketsModule.forRoot({
      auth: defineFirebaseAuth({ firebaseApp }),
      repository: defineTypeOrmRepository({ /* … */ }),
      userMetadata: { entity: UserMetadataEntity, createDto, updateDto },
      resources: [petResource],
    }),
  ],
})
export class AppModule {}
```

The convention: **for each external-IdP adapter, you write one
`defineXxxAuth(config)` helper**. The helper hides the `nestImports`
and the `authProviderExternallyManaged` flag — your `AppModule`
keeps seeing configuration only. Today this helper lives in your
app; future adapter packages may ship it pre-built.

### Override a single CRUD operation

```typescript
import { defineResource } from '@bitwild/rockets';
import { CrudCreateCommand } from '@bitwild/rockets-crud';
import { CommandHandler } from '@nestjs/cqrs';

@CommandHandler(CrudCreateCommand)
class CustomPetCreateHandler { /* custom logic */ }

defineResource({
  entity: PetEntity,
  operations: {
    create: {
      body: PetCreateDto,
      response: PetResponseDto,
      handler: CustomPetCreateHandler,   // overrides the default create flow
    },
    list:   { response: PetResponseDto },
    read:   { response: PetResponseDto },
    update: { body: PetUpdateDto, response: PetResponseDto },
    delete: {},
  },
});
```

Core auto-registers `CustomPetCreateHandler` as a provider. Don't list
it again in `providers:`.

---

## The three `auth` shapes — when to use which

`RocketsModule.forRoot({ auth: ... })` accepts three shapes. Use this
table to pick:

| Shape | Use when | Example |
|---|---|---|
| `Type<AuthAdapterInterface>` | You register the adapter as a provider yourself (typically through your own `defineModuleResource` or a dedicated module). | `auth: FirebaseAuthAdapter` (with a `defineModuleResource` that lists it in `providers + exports`) |
| `defineAuthFeature({ adapter, entities?, controllers? })` from `@bitwild/rockets-core` | Adapter ships with its own entities (a `User` table for a JWT demo) and/or routes (a `/auth/login` controller). One bundle owns all three. | `auth: defineAuthFeature({ adapter, entities: [UserEntity], controllers: [AuthController] })` |
| `defineRocketsAuth({ ... })` from `@bitwild/rockets-auth` | You want the **full built-in auth system** (signup, login, OTP, recovery, RBAC, admin). Switches the app to "Rockets owns the user table" mode. | `auth: defineRocketsAuth({ persistence, userMetadata, userCrud, useFactory })` |

The first two are external-auth shapes (your IdP owns identity). The
third turns the app into a built-in-auth app and is documented in
[`@bitwild/rockets-auth`](../rockets-server-auth/).

---

## Reference

### Endpoints this package adds

| Endpoint | Auth required | Purpose |
|---|---|---|
| `GET /me` | yes | External user merged with local metadata |
| `PATCH /me` | yes | Update metadata via `userMetadata.updateDto` |
| `GET /api` | no | Swagger UI |

Plus every route contributed by `resources[]`.

### `RocketsModule.forRoot(options)` / `forRootAsync(asyncOptions)`

Forwarded to `RocketsCoreModule` internally. Adds `MeController` and an
optional global `AuthServerGuard`.

| Field | Type | Required | What it does |
|---|---|---|---|
| `auth` | `Type<AuthAdapterInterface>` \| `AuthFeatureBundle` \| `RocketsAuthIntegration` | ✅ | Adapter class, `defineAuthFeature()` bundle, or `defineRocketsAuth()` integration. |
| `repository` | `RepositoryModuleInterface` \| `RepositoryBootstrap` | optional | Default DB adapter. Bootstrap shape lets Rockets own `forRoot(entities)` too. |
| `userMetadata` | `RocketsUserMetadataConfig` | optional | Entity + DTOs for `/me`. |
| `resources` | `ReadonlyArray<ResourceInput>` | optional | `defineResource`, `defineModuleResource`, manual configs. |
| `enableGlobalGuard` | `boolean` (default `true`) | optional | Register `AuthServerGuard` as `APP_GUARD`. Set `false` if you want route-level `@UseGuards` instead. |
| `disableController` | `{ me?: boolean }` | optional | Disable built-in controllers (currently `MeController`). |
| `handlers` | `{ upsertUserMetadata?, getUserMetadata? }` | optional | Override the metadata CQRS handlers. |
| `global` | `boolean` (default `false`) | optional | Make the module global. |

### `AuthAdapterInterface`

```typescript
interface AuthAdapterInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}

interface AuthorizedUser {
  id: string;
  sub: string;
  email?: string;
  userRoles?: { role: { name: string } }[];   // shape required for RBAC
  claims?: Record<string, unknown>;            // free-form IdP payload
}
```

`userRoles` is **shape-sensitive**: an entry must be `{ role: { name: string } }`,
not `{ name: string }`. The access-control layer reads `.role.name`.

### Decorators

| Decorator | Purpose |
|---|---|
| `@AuthPublic()` | Bypass `AuthServerGuard`. |
| `@AuthUser()` (`@concepta/nestjs-authentication`) | Inject `AuthorizedUser` into a route handler. |

### Helpers — import from `@bitwild/rockets`

| Symbol | Purpose |
|---|---|
| `defineResource()` | CRUD bundle with auto-controller + persistence row. |
| `defineModuleResource()` | Non-CRUD bundle — flat `entities` / `imports` / `controllers` / `providers` / `exports`. |
| `defineSubResource()` | Nested resource with path-scope hook + guard. |
| `defineAuthFeature()` | Auth adapter + entities + controllers, all in one bundle. |
| `relation(target, prop, opts?)` | Type-safe cross-resource relation. |
| `AUTH_ADAPTER_TOKEN` | Inject the configured adapter (`@Inject(AUTH_ADAPTER_TOKEN)`). |
| `AuthPublic` | Public-route decorator. |

### Helpers — import from `@bitwild/rockets-core`

| Symbol | Purpose |
|---|---|
| `getActor(ctx)` | Authenticated user from a CRUD context. |
| `getCrudContext(ctx)` | Full CRUD context (request, params, …). |
| `OwnerStampHook.for(Entity, column?)` | Stamp `userId` (or custom column) on create/update. |
| `OwnerScopeHook.for(Entity, column?)` | Filter list/read/update/delete by `userId`. |
| `AfterCreateReloadHook.for(Entity)` | Reload after create (use when entity declares eager relations TypeORM `save()` doesn't return). |
| `PathScopeHook.for(Entity, paramName, fkColumn)` | Filter sub-resource rows by parent URL param; stamp FK on create. |
| `PathScopeGuard.for(paramName, parentKey, ownerColumn)` | Verify actor owns the parent. |

---

## Troubleshooting

### `/me` returns 401 even with a valid token

- Check the `Authorization: Bearer <token>` header is being sent.
- Check your adapter actually returns an `AuthorizedUser` — throwing
  `UnauthorizedException` or returning `null` fails the guard.
- Check `userRoles` shape: `[{ role: { name: 'admin' } }]`, not
  `[{ name: 'admin' }]`. Wrong shape passes the guard but breaks ACL.

### Swagger UI is empty / schemas missing fields

The `@nestjs/swagger` CLI plugin is **not** enabled. Add
`@ApiProperty()` / `@ApiPropertyOptional()` to every DTO field by hand.
`@Expose()` from `class-transformer` does **not** populate Swagger.

### `Nest can't resolve dependencies of FirebaseAuthAdapter`

Your adapter depends on a provider (`FIREBASE_TOKEN_VERIFIER`, an
`HttpService`, etc.) that core can't see. Two fixes:

1. Register the adapter through a `defineModuleResource` that owns
   its dependencies (cleanest — see Step 5).
2. If the adapter lives in its own Nest module, pass it via
   `defineAuthFeature` so Rockets knows the adapter is externally
   provided and doesn't try to instantiate it inside core.

### `@InjectDynamicRepository('pet')` throws "Unknown dynamic repository"

The entity isn't registered. Make sure it appears in one of:

- `defineResource({ entity: PetEntity, … })`
- `defineModuleResource({ entities: [PetEntity] })`
- `userMetadata: { entity: PetEntity }` (only for the metadata table)

`TypeOrmModule.forFeature([PetEntity])` is **not** sufficient — that
registers a TypeORM repo, not the dynamic repo Rockets uses.

### Hooks silently do nothing

`HookModule` must be registered. Rockets does this for you in
`RocketsCoreModule`. If you stripped the imports manually (e.g. forked
the module-definition), `HookResolverService` is undefined and every
`@RepoHook` becomes dead code with no error.

### My adapter's `validateToken` is called twice per request

`AUTH_ADAPTER_TOKEN` is registered as `{ useExisting: AdapterClass }` —
both `@Inject(AUTH_ADAPTER_TOKEN)` and `@Inject(AdapterClass)` resolve
to the same singleton. If you're seeing two calls, check that something
else (an interceptor, a custom guard) isn't independently invoking
`.validateToken`.

---

## Production checklist

1. Replace SQLite in-memory with a real driver and `forRootAsync` that
   reads connection from `ConfigService` / env.
2. Set `synchronize: false`; use migrations.
3. Pin exact NPM versions — pre-1.0, breaking changes can land.
4. Every public DTO field: `@ApiProperty()` / `@ApiPropertyOptional()`.
5. Export only cross-bundle symbols from `defineModuleResource`
   (`exports: [...]`). Internal helpers stay in `providers:` only.
6. Write e2e tests for every user-facing flow (auth happy path, owner
   scoping, `/me` PATCH validation).
7. Audit: `enableGlobalGuard` is on by default — confirm public routes
   are explicitly `@AuthPublic()` and nothing else.
8. Production verifier for your IdP — no test/fake verifiers in prod.

---

## License

BSD-3-Clause — see [`../../LICENSE.txt`](../../LICENSE.txt).
