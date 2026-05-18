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

> Pre-1.0: packages are `1.0.0-alpha.7`. Public API and patterns are
> stable; field renames may still happen before 1.0. Pin exact versions
> in production.

---

## Table of contents

**Introduction**
- [Why does Rockets exist?](#why-does-rockets-exist)
- [Designed for AI-driven code generation](#designed-for-ai-driven-code-generation)
- [The `define*(config)` convention — one rule for everything](#the-defineconfig-convention--one-rule-for-everything)
- [The two paths](#the-two-paths)
- [How the packages fit together](#how-the-packages-fit-together)
- [Prerequisites](#prerequisites)

**Tutorial**
- [Build a Rockets app from scratch](#tutorial--build-a-rockets-app-from-scratch)

**How-to guides**
- [Auth / resources / persistence / troubleshooting](#how-to-guides)

**Reference**
- [Per-package READMEs, starting point matrix, repository layout](#reference)

**Meta**
- [Status](#status) · [Contributing](#contributing) · [Security](#security) · [License](#license)

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

### What `AuthorizedUser` looks like

The shape your adapter returns. This is the entire surface between
your IdP and the rest of the app:

```typescript
interface AuthAdapterInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}

interface AuthorizedUser {
  id: string;                                   // required
  sub: string;                                  // required (often === id)
  email?: string;
  userRoles?: { role: { name: string } }[];     // drives RBAC
  claims?: Record<string, unknown>;             // free-form IdP payload
}
```

---

## Designed for AI-driven code generation

This is the **headline design goal** of the whole stack. AI agents
(Claude Code, Copilot, Cursor, …) work best when each feature is a
**single self-contained configuration object** that does not require
cross-file context to understand or extend.

Rockets is built around that constraint:

- **One bundle = one feature.** A `defineResource()` /
  `defineModuleResource()` call carries everything that feature needs:
  entity, DTOs, hooks, operations, controllers, providers, exports. An
  AI reading `pet.resource.ts` has the entire Pet feature in front of
  it — no jumping to a controller file, a separate module, a routes
  file, or a global entity-registration list.
- **Adding a feature is one config object + one line.** No `@Module`
  scaffolding. The AI emits one bundle and appends it to `resources[]`.
- **Removing is symmetric.** Delete the folder, delete one line.
  Nothing drifts.
- **Stable narrow contracts.** Auth = one interface. Data = one
  interface. CRUD = one helper. The AI never has to pick between
  overlapping abstractions.

**AI + declarative configuration is a strong combination.** Generate a
`Pet` resource, an `Appointment` resource, and a `PetTransfer` workflow
with three independent AI prompts: each writes one folder, exports one
bundle, appends one line. The generations cannot collide and require no
global coordination.

---

## The `define*(config)` convention — one rule for everything

Rockets follows **one rule** across every adapter, every helper, every
integration:

> **`AppModule` only contains configuration.** Every mechanical detail
> (connection setup, Nest module composition, provider registration,
> entity wiring) is owned by a `define<Thing>(config)` helper that
> takes configuration in and returns the Rockets-shaped object out.

| You'd normally write | Rockets pattern |
|---|---|
| `TypeOrmModule.forRoot({ entities: [...] })` + `TypeOrmModule.forFeature(...)` | `defineTypeOrmRepository(connectionConfig)` — `forRoot(entities)` + `forFeature(entities)` are owned by the helper; the entity list comes from `resources[]` automatically |
| `FirebaseAuthModule.forRoot(...)` + `{ provide: AUTH_ADAPTER_TOKEN, useExisting: FirebaseAdapter }` + entity registration | `defineFirebaseAuth({ verifier })` — Nest module, adapter alias, and entity registration all inside the helper |
| `AuthModule + UserModule + RoleModule + InvitationModule + …` | `defineRocketsAuth({ persistence, userMetadata, useFactory, … })` — the whole built-in auth system as one config call |

The convention is the same every time:

```typescript
// From the adapter / integration package
export function defineXxx(config: XxxConfig): /* Rockets-shaped object */ {
  // Internally wires nest modules, registers providers,
  // declares entities. The app never sees this code.
}
```

So your `AppModule` always looks like this:

```typescript
@Module({
  imports: [
    RocketsModule.forRoot({
      auth:        defineXxxAuth({ /* config */ }),       // ← config in
      repository:  defineXxxRepository({ /* config */ }), // ← config in
      userMetadata: { entity: UserMetadataEntity, /* DTOs */ },
      resources:   [/* feature bundles */],
    }),
  ],
})
export class AppModule {}
```

No raw `TypeOrmModule.forRoot`. No parallel auth module. No hand-listed
entities. No manual provider arrays. **Just configuration.**

---

## The two paths

Pick the package that matches who owns your users:

| Who owns the user? | Package | What you write |
|---|---|---|
| **An external IdP** — Firebase, Auth0, Cognito, your enterprise SSO | [`@bitwild/rockets`](./packages/rockets-server/) | One adapter (`validateToken`) + your features |
| **Rockets itself** — signup, login, OTP, recovery, OAuth, admin | [`@bitwild/rockets-auth`](./packages/rockets-server-auth/) | Just your features. Auth is already there. |

Both paths use **the same composition surface** —
`RocketsModule.forRoot({ … })`, the same `defineResource`, the same
`defineModuleResource`, the same hooks. The only thing that changes is
what you pass to `auth:`.

> Need only the engine — no `/me`, no global guard, no presentation? Use
> [`@bitwild/rockets-core`](./packages/rockets-core/) directly.

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
│  • Dynamic repository wiring (RepositoryBootstrap)          │
│  • CQRS handlers, Swagger registration, hooks               │
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
              ▲
              │
   ┌──────────┴───────────┐
   │  Adapter packages    │
   │  defineFirebaseAuth  │
   │  defineAuth0Auth     │
   │  …                   │
   └──────────────────────┘
```

The principle: anything **both** server packages need lives in core.
Anything *only* the external-auth path needs lives in `@bitwild/rockets`.
Anything that has to do with Rockets owning the user table lives in
`@bitwild/rockets-auth`. Every adapter package wraps its wiring in a
`define*(config)` helper so the app only sees configuration.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node | ≥ 18 |
| NestJS | ^11 |
| TypeScript | ≥ 5 |
| Package manager | yarn (workspaces) |

The `@nestjs/swagger` CLI plugin is **not** enabled. Every DTO field
needs `@ApiProperty()` or `@ApiPropertyOptional()` explicitly.

---

## Tutorial — build a Rockets app from scratch

A complete external-auth API in five steps. Self-contained: nothing
referenced here lives outside this README and the package READMEs.

### Step 1 — install

```bash
yarn add @bitwild/rockets @bitwild/rockets-core \
  @concepta/nestjs-repository-typeorm \
  @nestjs/typeorm typeorm \
  class-transformer class-validator @nestjs/swagger
```

### Step 2 — write your repository helper

The `defineTypeOrmRepository(config)` helper takes a connection
config and returns a `RepositoryBootstrap`. Rockets supplies the
entity list automatically — you never list entities at the app root.

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

This is the **only place** in your app that mentions TypeORM. Swapping
to Firestore later is replacing this one helper.

### Step 3 — implement the auth adapter

The adapter is the only place that knows about your IdP. One method.

```typescript
// src/auth/my-auth.adapter.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import type { AuthAdapterInterface, AuthorizedUser } from '@bitwild/rockets-core';

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
      userRoles: (payload.roles ?? []).map((name) => ({ role: { name } })),
      claims: payload,
    };
  }
}
```

For self-contained adapters (no external Nest module dependencies),
**passing the class directly to `auth:` is enough**. Rockets
auto-registers the class as a provider and aliases
`AUTH_ADAPTER_TOKEN` to it.

If your adapter needs an external module (Firebase, OAuth providers),
wrap it in a `defineXxxAuth(config)` helper that returns a
`RocketsAuthIntegration` — see
[`packages/rockets-server/README.md#how-to-auth-adapters-with-external-dependencies`](./packages/rockets-server/README.md#how-to-auth-adapters-with-external-dependencies).

### Step 4 — declare a CRUD feature

```typescript
// src/pets/pet.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, DeleteDateColumn } from 'typeorm';

@Entity('pets')
export class PetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() userId!: string;        // stamped by OwnerStampHook
  @Column() name!: string;
  @Column({ nullable: true }) species?: string;
  @DeleteDateColumn() dateDeleted?: Date;
}
```

```typescript
// src/pets/pet.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

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
  hooks: [
    OwnerStampHook.for(PetEntity),   // stamp userId on write
    OwnerScopeHook.for(PetEntity),   // filter list/read by userId
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

This single declaration produces `GET/POST/PATCH/DELETE /pets` (+
soft delete and restore), DTO validation, Swagger schema, owner
stamping, owner scoping, and a dynamic repository injectable as
`@InjectDynamicRepository('pet')`.

### Step 5 — compose `AppModule` (configuration only)

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { RocketsModule } from '@bitwild/rockets';
import { MyAuthAdapter } from './auth/my-auth.adapter';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';
import { UserMetadataEntity } from './users/user-metadata.entity';
import { petResource } from './pets/pet.resource';

@Module({
  imports: [
    RocketsModule.forRoot({
      // 1. Auth: just the class. Rockets auto-registers it as a
      //    provider AND aliases AUTH_ADAPTER_TOKEN to it.
      auth: MyAuthAdapter,

      // 2. Persistence: configuration goes IN, RepositoryBootstrap
      //    comes OUT. The helper owns the connection AND every
      //    per-entity registration. Entity list flows in from
      //    resources[] + userMetadata.
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,                  // dev only
      }),

      // 3. User-metadata table — joined to the external user by userId.
      userMetadata: { entity: UserMetadataEntity },

      // 4. Features. Each bundle carries its own entity/DTOs/hooks.
      resources: [petResource /* , … */],
    }),
  ],
})
export class AppModule {}
```

Boot it:

```bash
nest start
# → http://localhost:3000
# → Swagger at http://localhost:3000/api
```

That's the whole app:

- `GET/POST/PATCH/DELETE /pets` — generated from `petResource`.
- `GET/PATCH /me` — provided by `RocketsModule`, returns the external
  user merged with local metadata.
- Every protected route runs `MyAuthAdapter.validateToken(token)`.
- Soft delete + restore baked into the pet routes.
- Owner stamping + scoping enforced at the repository layer.

**No `TypeOrmModule.forRoot`. No `AuthModule`. No `providers: [MyAuthAdapter]`. No `@Module` per feature.** The `define*(config)` helpers own every wiring detail.

> Want built-in signup/login/OTP/admin instead of an external IdP? Pass
> `auth: defineRocketsAuth({ … })` from
> [`@bitwild/rockets-auth`](./packages/rockets-server-auth/). The rest
> of the `forRoot` shape stays identical — switching paths is changing
> one line.

---

## How-to guides

Pointers for tasks not covered by the tutorial. Each link drops you in
the right package README.

### Auth

- **Use Firebase / Auth0 / Cognito** —
  [`packages/rockets-server/README.md#how-to-auth-adapters-with-external-dependencies`](./packages/rockets-server/README.md#how-to-auth-adapters-with-external-dependencies)
- **Switch to built-in auth** (signup, login, OTP, RBAC, admin) —
  [`packages/rockets-server-auth/README.md`](./packages/rockets-server-auth/README.md)
- **Mark a route as public** (skip the global guard) —
  [`packages/rockets-server/README.md#mark-a-route-as-public`](./packages/rockets-server/README.md#mark-a-route-as-public)
- **Access the authenticated user** in a CRUD handler —
  [`packages/rockets-server/README.md#access-the-authenticated-user`](./packages/rockets-server/README.md#access-the-authenticated-user)

### Resources & features

- **Add a sub-resource** (`/parents/:parentId/children`) —
  [`packages/rockets-server/README.md#how-to-add-a-sub-resource-petspetidtags`](./packages/rockets-server/README.md#how-to-add-a-sub-resource-petspetidtags)
- **Add a non-CRUD feature** (service + controller) —
  [`packages/rockets-server/README.md#add-a-non-crud-feature-service--controller`](./packages/rockets-server/README.md#add-a-non-crud-feature-service--controller)
- **Override a single CRUD operation** with a custom handler —
  [`packages/rockets-server/README.md#override-a-single-crud-operation`](./packages/rockets-server/README.md#override-a-single-crud-operation)
- **Inject a dynamic repository** —
  [`packages/rockets-server/README.md#inject-a-dynamic-repository`](./packages/rockets-server/README.md#inject-a-dynamic-repository)

### Persistence

- **Swap TypeORM for another store** —
  [`packages/rockets-server/README.md#swap-typeorm-for-another-adapter`](./packages/rockets-server/README.md#swap-typeorm-for-another-adapter)
- **Mix two stores in one app** (per-entity adapter override) —
  [`packages/rockets-core/README.md#mix-two-stores-in-one-app`](./packages/rockets-core/README.md#mix-two-stores-in-one-app)

### Troubleshooting

- **`/me` returns 401**, **empty Swagger**, **`Nest can't resolve dependencies`**, **`@InjectDynamicRepository` not found**, **hooks silently do nothing** —
  [`packages/rockets-server/README.md#troubleshooting`](./packages/rockets-server/README.md#troubleshooting)

---

## Reference

The per-package READMEs are the authoritative reference. Pick by what
you're working on:

| Package | Reference |
|---|---|
| **Engine** — auth abstraction, resource planner, repository wiring, hooks | [`packages/rockets-core/README.md`](./packages/rockets-core/README.md) |
| **External-auth composition** — `RocketsModule`, `/me`, global guard, `MeController` | [`packages/rockets-server/README.md`](./packages/rockets-server/README.md) |
| **Built-in auth** — `defineRocketsAuth(config)`, signup/login/OTP/admin | [`packages/rockets-server-auth/README.md`](./packages/rockets-server-auth/README.md) |
| **Repository abstraction** — `RepositoryInterface`, `RepositoryBootstrap` | [`packages/rockets-repository/`](./packages/rockets-repository/) |
| **CRUD generator** — internals behind `defineResource` | [`packages/rockets-crud/`](./packages/rockets-crud/) |
| **Access control** — ACL / RBAC primitives | [`packages/rockets-access-control/`](./packages/rockets-access-control/) |

### Pick your starting point

| You want… | Install | Reference |
|---|---|---|
| **Bring-your-own auth** (Firebase, Auth0, custom IdP) + CRUD | `@bitwild/rockets` | [`packages/rockets-server/README.md`](./packages/rockets-server/README.md) |
| **Built-in auth** (signup / login / OTP / recovery / admin) | `@bitwild/rockets` + `@bitwild/rockets-auth` | [`packages/rockets-server-auth/README.md`](./packages/rockets-server-auth/README.md) |
| **Just the engine** — no `/me`, no global guard | `@bitwild/rockets-core` | [`packages/rockets-core/README.md`](./packages/rockets-core/README.md) |

### Repository layout

| Directory | Contents |
|---|---|
| [`packages/rockets-core/`](./packages/rockets-core/) | Auth abstraction, CQRS, resource planner, repository registration, Swagger registration. The engine. |
| [`packages/rockets-server/`](./packages/rockets-server/) | Composition root for **external** auth (`/me`, global guard). |
| [`packages/rockets-server-auth/`](./packages/rockets-server-auth/) | Full built-in auth: JWT, signup, login, OTP, recovery, OAuth, admin. |
| [`packages/rockets-common/`](./packages/rockets-common/) | Shared utilities, hooks, Swagger UI re-export. |
| [`packages/rockets-repository/`](./packages/rockets-repository/) | Abstract data access. No ORM in the type layer. |
| [`packages/rockets-crud/`](./packages/rockets-crud/) | Generic CRUD generator. |
| [`packages/rockets-access-control/`](./packages/rockets-access-control/) | ACL / RBAC primitives. |
| [`development-guides/`](./development-guides/) | AI-oriented playbooks (configuration, patterns, testing). |

---

## Status

Currently on `feature/version8`: the migration to
`@concepta/nestjs-*` v8 is complete for the auth-side packages. A few
transitive dependencies stay on v7 until upstream ships v8 (OAuth
providers, access-control, email, event, swagger-ui). The public API
and both sample apps work today.

Pre-1.0: package versions are `1.0.0-alpha.7`. Patterns are stable;
field renames may still happen before 1.0.

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
