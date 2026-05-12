# `@bitwild/rockets`

[![NPM Latest](https://img.shields.io/npm/v/@bitwild/rockets)](https://www.npmjs.com/package/@bitwild/rockets)
[![NPM Downloads](https://img.shields.io/npm/dw/@bitwild/rockets)](https://www.npmjs.com/package/@bitwild/rockets)
[![CI](https://img.shields.io/github/actions/workflow/status/btwld/rockets/ci-merge.yml?branch=main&label=CI)](https://github.com/btwld/rockets/actions/workflows/ci-merge.yml)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![License](https://img.shields.io/npm/l/@bitwild/rockets)](https://github.com/btwld/rockets/blob/main/LICENSE.txt)

> **Bring your own auth.** Plug in Firebase, Auth0, Cognito, your
> company's IdP, or a custom JWT issuer — Rockets validates the
> tokens, stores local metadata alongside, and gives you declarative
> CRUD on top.

---

## Table of contents

- [Introduction](#introduction)
- [Tutorial — Your first external-auth server](#tutorial--your-first-external-auth-server)
- [How-to guides](#how-to-guides)
- [Reference](#reference)
- [Explanation](#explanation)
- [License](#license)

---

## Introduction

`@bitwild/rockets` is the composition layer for **external
authentication systems**. You implement one interface
(`AuthAdapterInterface`), and the module wires up:

- A global `AuthServerGuard` that validates every request via your provider.
- A `/me` endpoint combining your external user with local metadata.
- Swagger UI for API documentation.
- Declarative CRUD resources via `defineResource()` and
  `defineModuleResource()`.

The contract is simple: your provider returns an `AuthorizedUser` from
a bearer token. Rockets makes that user available everywhere — in
controllers via `@AuthUser()`, in CRUD handlers via
`getAuthorizedUserFromCrudContext()`, in repository hooks for
per-request scoping.

### When to use this package

| Use this when… | Use a different package when… |
|---|---|
| Users live in an external IdP (Firebase, Auth0, Cognito, …) | You need signup/login/OAuth/OTP/admin user CRUD → [`@bitwild/rockets-auth`](../rockets-server-auth/) |
| You want token validation + local metadata + CRUD | You don't want `/me` or a global guard → [`@bitwild/rockets-core`](../rockets-core/) |
| You want one composition surface and minimal boilerplate | You're building a custom composition root from scratch |

---

## Tutorial — Your first external-auth server

You'll get a working server with `/me`, a `pet` CRUD resource, and a
custom `AuthAdapterInterface` validating bearer tokens.

### 1. Install

```bash
yarn add @bitwild/rockets @bitwild/rockets-core \
  @concepta/nestjs-repository-typeorm typeorm @nestjs/typeorm \
  class-transformer class-validator
```

Requires NestJS `^11`, Node `>=18`, TypeScript `>=5`.

### 2. Implement `AuthAdapterInterface`

```typescript
// providers/firebase-auth.adapter.ts
import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import type { AuthAdapterInterface, AuthorizedUser } from '@bitwild/rockets';

@Injectable()
export class FirebaseAuthAdapter implements AuthAdapterInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      id: decoded.uid,
      sub: decoded.uid,
      email: decoded.email,
      userRoles: (decoded.roles ?? []).map((name: string) => ({ role: { name } })),
      claims: decoded,
    };
  }
}
```

### 3. Declare your local metadata

```typescript
// entities/user-metadata.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('user_metadata')
export class UserMetadataEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) userId!: string;
  @Column({ nullable: true }) firstName?: string;
  @Column({ nullable: true }) lastName?: string;
}

// dto/user-metadata.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UserMetadataCreateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
}

export class UserMetadataUpdateDto extends UserMetadataCreateDto {}
```

### 4. Wire `RocketsModule`

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { RocketsModule } from '@bitwild/rockets';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import {
  UserMetadataCreateDto,
  UserMetadataUpdateDto,
} from './dto/user-metadata.dto';
import { FirebaseAuthAdapter } from './providers/firebase-auth.adapter';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [UserMetadataEntity],
      synchronize: true,
    }),
    RocketsModule.forRoot({
      auth: FirebaseAuthAdapter,                  // class reference
      repository: TypeOrmRepositoryModule,
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
      },
    }),
  ],
})
export class AppModule {}
```

The `auth` field takes the **class** (not an instance). Core
auto-registers the class as a Nest provider AND aliases it to
`AUTH_ADAPTER_TOKEN` via `useExisting`, so no manual `providers: [...]`
step is needed. Boot fails fast if the class does not implement
`AuthAdapterInterface.validateToken`.

### 5. Run it

```bash
nest start
```

```bash
TOKEN="<a valid Firebase id token>"

curl http://localhost:3000/me -H "Authorization: Bearer $TOKEN"
# → { id, sub, email, userRoles, userMetadata }

curl -X PATCH http://localhost:3000/me \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "userMetadata": { "firstName": "Ada" } }'
```

That's the full integration. Add CRUD resources next via `defineResource()`.

---

## How-to guides

### How to add a CRUD resource

```typescript
// pet/pet.entity.ts — your TypeORM entity
@Entity('pets')
export class PetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column() name!: string;
  @Column({ nullable: true }) ownerId?: string;
}

// pet/pet.resource.ts
import { defineResource } from '@bitwild/rockets';
import { Operation } from '@concepta/nestjs-common';
import { PetEntity } from './pet.entity';

export const petResource = defineResource({
  key: 'pet',
  entity: PetEntity,
  operations: {
    list:   { response: PetResponseDto },
    read:   { response: PetResponseDto },
    create: { request: PetCreateDto, response: PetResponseDto },
    update: { request: PetUpdateDto, response: PetResponseDto },
    delete: {},
  },
});

// app.module.ts — add to RocketsModule.forRoot
RocketsModule.forRoot({
  // ...
  repository: TypeOrmRepositoryModule,
  resources: [petResource],
})
```

You get `GET/POST/PATCH/DELETE /pets` plus pagination, filtering, and
relations — without writing a controller.

### How to add a non-CRUD feature (controllers + services + entity colocated)

```typescript
// auth/auth.feature.ts
import { defineModuleResource } from '@bitwild/rockets';
import { UserEntity } from './user.entity';
import { AuthController } from './auth.controller';
import { SampleAuthAdapter } from './sample-auth.adapter';

// Flat shape — no `module: { ... }` wrapper.
export const authFeature = defineModuleResource({
  entities: [{ key: 'user', entity: UserEntity }],
  controllers: [AuthController],
  providers: [SampleAuthAdapter],
  exports: [SampleAuthAdapter],   // makes it injectable as the `auth` adapter
});

// app.module.ts
RocketsModule.forRoot({
  auth: SampleAuthAdapter,        // class reference, registered by authFeature
  repository: TypeOrmRepositoryModule,
  resources: [authFeature, petResource],
})
```

The resource owns its entity registration AND its Nest wiring in one
place. Move/delete the resource = move/delete the whole feature.

### How to add a sub-resource (`/pets/:petId/tags`)

```typescript
import { defineResource, defineSubResource } from '@bitwild/rockets';

defineResource({
  key: 'pet',
  entity: PetEntity,
  // ...
  subResources: {
    petTags: defineSubResource({
      key: 'petTag',
      entity: PetTagEntity,
      urlSegment: 'tags',                              // /pets/:petId/tags
      parentOwnerColumn: 'userId',                     // required (no default)
      reloadAfterCreate: true,                         // opt-in eager reload
      operations: {
        list:   { response: PetTagResponseDto },
        create: { body: PetTagCreateDto, response: PetTagResponseDto },
        delete: {},
      },
    }),
  },
})
```

`defineSubResource()` auto-injects:

- **`PathScopeHook`** — strips body-supplied FK then stamps it from
  `:petId` on create; filters list/read/update/delete by the same
  param. Throws if the URL param is missing in a CRUD context.
- **`PathScopeGuard`** — validates authenticated actor + parent
  ownership (401 / 404 with intended status). Auto-applied via
  `@UseGuards(...)` on the controller; auto-registered as provider.
- **`@ApiParam(:petId)`** — appended to every operation for OpenAPI.
- **`request.params: { id, petId }`** — the controller-level CRUD config.

Configurable on the sub:

| Field | Default | Purpose |
|---|---|---|
| `parentOwnerColumn` | **required** | Column used by the auto guard to check parent ownership. **Must be declared explicitly** (no default — wrong column = silent 404 for legitimate users). Use `disablePathScopeGuard: true` when the parent is public. |
| `disablePathScopeGuard` | `false` | Opt out of the auto guard. |
| `reloadAfterCreate` | `false` | Opt **in** to `AfterCreateReloadHook`. Adds an extra DB round-trip after create so eager relations land on the response. Adapter-specific behaviour (TypeORM `save()` omits eager loads); off by default. |

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

  findByOwner(ownerId: string) {
    return this.petRepo.find({
      where: Where.eq<PetEntity>('ownerId', ownerId),
    });
  }
}
```

Key (`'pet'`) matches the one passed to `defineResource()` /
`defineModuleResource({ entities: [{ key, entity }] })`.

### How to mark a route as public

```typescript
import { AuthPublic } from '@bitwild/rockets';

@Controller('auth')
export class AuthController {
  @Post('signup')
  @AuthPublic()                  // bypasses AuthServerGuard
  signup(@Body() dto: SignupDto) { ... }
}
```

### How to access the authenticated user

```typescript
import { AuthUser } from '@concepta/nestjs-authentication';
import type { AuthorizedUser } from '@bitwild/rockets';

@Get('profile')
profile(@AuthUser() user: AuthorizedUser) {
  return user;
}

// Inside CRUD handlers:
import { getAuthorizedUserFromCrudContext } from '@bitwild/rockets';

@CommandHandler(CrudCreateCommand)
class PetCreateHandler {
  async execute(cmd: CrudCreateCommand) {
    const user = getAuthorizedUserFromCrudContext(cmd.context);
    // user.id, user.email, user.userRoles
  }
}
```

### How to scope a resource to its owner

```typescript
import { OwnerScopeHook } from '@bitwild/rockets';
import { UseHooks } from '@bitwild/rockets-common';

defineResource({
  key: 'pet',
  entity: PetEntity,
  path: 'pets',
  controller: {
    extraDecorators: [UseHooks(OwnerScopeHook)],
  },
  // remember to add OwnerScopeHook to providers if you need DI
})
```

`OwnerScopeHook` filters List/Read/Update/Delete by `userId === authUser.id`.
For Create, write a custom command handler — the column needs to go
into the body, not the where clause.

### How to use a non-TypeORM persistence adapter

Domain code (services, handlers, hooks) depends on `RepositoryInterface`,
not TypeORM. Swap the adapter:

```typescript
import { FirestoreRepositoryModule } from '@bitwild/rockets-repository-firestore';

RocketsModule.forRoot({
  // ...
  repository: FirestoreRepositoryModule,
})
```

Per-entity overrides for mixed-store apps:

```typescript
RocketsModule.forRoot({
  // ...
  repository: TypeOrmRepositoryModule,
  userMetadata: {
    entity: UserMetadataEntity,
    repository: FirestoreRepositoryModule, // metadata in Firestore
  },
  resources: [
    defineModuleResource({
      entities: [{
        key: 'analytics',
        entity: AnalyticsEntity,
        repository: FirestoreRepositoryModule,
      }],
      providers: [AnalyticsService],
    }),
    petResource, // stays on TypeORM (default)
  ],
})
```

---

## Reference

### Endpoints provided

| Endpoint | Auth | Description |
|---|---|---|
| `GET /me` | required | External user merged with local metadata |
| `PATCH /me` | required | Updates local metadata; body validated by `userMetadata.updateDto` |
| `GET /api` | public | Swagger UI |

Plus all routes contributed by your `defineResource()` and
`defineModuleResource()` bundles.

### `RocketsModule.forRoot(options) / forRootAsync(asyncOptions)`

Public surface. All fields are forwarded to `RocketsCoreModule`
internally.

| Field | Type | Required | Description |
|---|---|---|---|
| `auth` | `Type<AuthAdapterInterface>` | ✅ | Class reference of the auth adapter. Core auto-registers it as a Nest provider and aliases it to `AUTH_ADAPTER_TOKEN`. Boot validates `validateToken` exists on the prototype. |
| `repository` | `RepositoryModuleInterface` | optional | Default persistence adapter. Omit when an upstream module already registers entities. |
| `userMetadata` | `RocketsUserMetadataConfig` | optional | Metadata entity + DTOs (drives `/me`). Supports a per-entity `repository` override. |
| `resources` | `ReadonlyArray<ResourceInput>` | optional | Mix of `defineResource()`, `defineModuleResource()`, manual configs. |
| `enableGlobalGuard` | `boolean` | default `true` | Register `AuthServerGuard` as `APP_GUARD`. |
| `disableController` | `{ me?: boolean }` | optional | Turn off built-in controllers. |
| `handlers` | `{ upsertUserMetadata?, getUserMetadata? }` | optional | Override metadata CQRS handlers. |
| `controllers` | `Type[]` | optional | Replace the default controller list. |
| `global` | `boolean` | default `false` | Make the module global. |

### `AuthAdapterInterface`

```typescript
interface AuthAdapterInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}

interface AuthorizedUser {
  id: string;                                   // required, stable
  sub: string;                                  // required, often === id
  email?: string;
  userRoles?: { role: { name: string } }[];     // drives RBAC
  claims?: Record<string, unknown>;             // free-form IdP payload
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | Stable user id |
| `sub` | yes | Subject (often same as id) |
| `email` | optional | If your IdP exposes it |
| `userRoles` | optional | Wrapped shape — `[{ role: { name } }]` — required for RBAC |
| `claims` | optional | Whole IdP payload, available to your code |

### Decorators

| Decorator | Purpose |
|---|---|
| `@AuthPublic()` | Bypass `AuthServerGuard` on a route or controller. |
| `@AuthUser()` (from `@concepta/nestjs-authentication`) | Inject the `AuthorizedUser` into a handler param. |

### Helpers re-exported from `rockets-core`

| Symbol | Purpose |
|---|---|
| `defineResource()` | CRUD-shaped resource (auto-generated controller + persistence row). |
| `defineModuleResource()` | Non-CRUD resource (entity registrations + flat Nest slice: `controllers`, `providers`, `exports`, `imports`). |
| `defineSubResource()` | Nested resource. Auto-injects `PathScopeHook` + `PathScopeGuard` + parent `@ApiParam` + composed `request.params`. Configurable via `parentOwnerColumn` (required), `disablePathScopeGuard`, `reloadAfterCreate` (opt-in). |
| `relation(source, target, prop, opts?)` | Type-safe cross-resource relation. |
| `getAuthorizedUserFromCrudContext(ctx)` | Read auth user from a CRUD context. |
| `AUTH_ADAPTER_TOKEN` | DI token aliased to the class passed via `auth`. Inject to access the adapter directly. |
| `AuthServerGuard` | The guard class (registered globally when `enableGlobalGuard: true`). |
| `PathScopeGuard` | Authenticated-actor + parent-ownership guard (auto-injected on sub-resources; usable directly). |
| `OwnerScopeHook` | Repo hook scoping list/read/update/delete to `authUser.id`. |
| `OwnerStampHook` | `beforeCreate`/`beforeUpdate` stamp `userId` from the actor + reject spoofing. |
| `PathScopeHook` | Generic FK-stamp + scope hook for sub-resources (auto-bound by `defineSubResource`). |
| `AfterCreateReloadHook` | Re-fetches by id after create so eager relations land on the response. Opt-in on sub-resources via `reloadAfterCreate: true`; add manually to top-level resources via `hooks: [...]`. |

---

## Explanation

### What `RocketsModule` adds on top of `RocketsCoreModule`

`RocketsModule` is a thin composition root over `RocketsCoreModule`:

- Adds the `MeController` (`/me`, `PATCH /me`).
- Optionally registers `AuthServerGuard` as a global guard (`enableGlobalGuard`).
- Forwards the same `repository`, `userMetadata`, `resources`
  options to core.

Everything you can do here, you can do with `rockets-core` directly —
you'd just write `MeController` yourself.

### How the configuration is transformed

The single `RocketsModule.forRoot({...})` call expands at boot into a
collection of regular NestJS module imports, providers, and
controllers. Knowing what each high-level field becomes makes it
easier to debug DI errors and reason about what is registered.

#### Input (what you write)

```typescript
RocketsModule.forRoot({
  auth: SampleAuthAdapter,
  repository: TypeOrmRepositoryModule,
  userMetadata: {
    entity: UserMetadataEntity,
    createDto: UserMetadataCreateDto,
    updateDto: UserMetadataUpdateDto,
  },
  resources: [
    petResource,            // defineResource() — CRUD
    authFeature,            // defineModuleResource() — entity + Nest slice
    petTransferFeature,     // defineModuleResource() — pure CQRS
  ],
})
```

#### Output (what gets wired)

| Input field | Becomes |
|---|---|
| `auth: SampleAuthAdapter` | `providers.push(SampleAuthAdapter)` + `{ provide: AUTH_ADAPTER_TOKEN, useExisting: SampleAuthAdapter }`. The `AuthServerGuard` injects the token. |
| `repository: TypeOrmRepositoryModule` | Default adapter for every dynamic-repository row. One `RepositoryModule.forFeature({ module, entities: [...] })` import per adapter group (per-entity overrides via `entry.repository` start a new group). |
| `userMetadata.entity` | Contributes one entity row to the persistence plan under the well-known key `USER_METADATA_MODULE_ENTITY_KEY`. |
| `userMetadata.updateDto` | Narrowed into `ROCKETS_USER_METADATA_DTO_TOKEN`; consumed by `MeController` for `PATCH /me` validation. |
| `resources: [defineResource(...)]` | Each becomes one `CrudModule.forFeature(...)` import. The bundle's entity + relations are folded into the persistence plan. Class-level decorators (`@ApiTags`, `@ApiBearerAuth`, `@UseHooks`, `@UseGuards`) are stamped on the auto-generated controller. |
| `resources: [defineModuleResource(...)]` | The `entities[]` rows are folded into the persistence plan. The `controllers/providers/exports/imports` slice is materialised as an inline `DynamicModule` and added to `RocketsCoreModule.imports`. |
| `resources: [...] subResources: { x: defineSubResource(...) }` | The sub is materialised as a peer `CrudResource` with composed `path`, auto-injected `PathScopeHook` (FK scope + stamp on create), auto-injected `PathScopeGuard` (parent ownership), composed `request.params: { id, parentParam }`, and `@ApiParam` per operation. |
| `enableGlobalGuard: true` (default) | `{ provide: APP_GUARD, useClass: AuthServerGuard }` registered on `RocketsModule`'s providers. |

#### Concrete expansion (sample-server)

```text
RocketsModule
└── imports:
    └── RocketsCoreModule
        ├── imports:
        │   ├── CqrsModule.forRoot()
        │   ├── ConfigModule.forFeature(rocketsCoreDefaultConfig)
        │   ├── HookModule.forRoot({})
        │   ├── RepositoryModule.forRoot({})
        │   │
        │   ├── RepositoryModule.forFeature({                  ◀── per adapter group
        │   │     module: TypeOrmRepositoryModule,
        │   │     entities: [
        │   │       { key: 'pet',      entity: PetEntity },
        │   │       { key: 'petTag',   entity: PetTagEntity },
        │   │       { key: 'user',     entity: UserEntity },
        │   │       { key: USER_METADATA_MODULE_ENTITY_KEY,
        │   │         entity: UserMetadataEntity },
        │   │       …
        │   │     ],
        │   │   })
        │   │
        │   ├── DynamicModule (authFeature materialised)        ◀── module resource
        │   │     controllers: [AuthController]
        │   │     providers:   [SampleAuthAdapter]
        │   │     exports:     [SampleAuthAdapter]
        │   │
        │   ├── DynamicModule (petTransferFeature materialised) ◀── CQRS-only resource
        │   │     imports:     [CqrsModule]
        │   │     controllers: [PetTransferController]
        │   │     providers:   [TransferPetOwnershipHandler]
        │   │
        │   ├── CrudModule.forRoot({…SafeCrudContext…})
        │   ├── CrudModule.forFeature(petResource.core)         ◀── /pets routes
        │   ├── CrudModule.forFeature(petTagsSubResource)       ◀── /pets/:petId/tags
        │   └── SwaggerUiModule.registerAsync(…)
        │
        ├── providers:
        │   ├── SampleAuthAdapter                               ◀── auto-registered
        │   ├── { provide: AUTH_ADAPTER_TOKEN,
        │   │     useExisting: SampleAuthAdapter }              ◀── the alias
        │   ├── AuthServerGuard
        │   ├── { provide: APP_INTERCEPTOR, useClass: AuthUserContextOverlay }
        │   ├── { provide: APP_INTERCEPTOR, useClass: ActorOverlay }
        │   ├── UpsertUserMetadataHandler / GetUserMetadataHandler
        │   ├── PathScopeGuard subclass per sub-resource        ◀── auto-injected
        │   └── PathScopeHook subclass per sub-resource         ◀── auto-injected
        │
        └── exports: AUTH_ADAPTER_TOKEN, ROCKETS_CORE_SETTINGS_TOKEN, …
│
├── controllers: [MeController]                                ◀── added by RocketsModule
└── providers:  [{ provide: APP_GUARD, useClass: AuthServerGuard }]
```

#### Sub-resource expansion (`defineSubResource`)

A single sub-resource entry like:

```typescript
petTags: defineSubResource({
  key: 'petTag',
  entity: PetTagEntity,
  parentOwnerColumn: 'userId',
})
```

declared inside `petResource` produces:

```text
CrudModule.forFeature({
  controller: {
    path: 'pets/:petId/tags',                      ◀── composed
    extraDecorators: [
      ApiTags('Pet Tags'),
      ApiParam({ name: 'petId', type: 'string' }),
      UseHooks(PathScopeHook_petId_petId, …),
      UseGuards(PathScopeGuard_petId_pet_userId), ◀── auto
    ],
    request: {
      params: {                                    ◀── composed
        id:    { field: 'id',    type: 'uuid', primary: true },
        petId: { field: 'petId', type: 'uuid' },
      },
    },
  },
  operations: [ /* list, read, create, delete */ ],
})

// Plus, in core.providers:
PathScopeGuard.for('petId', 'pet', 'userId')           ◀── auto-injected
PathScopeHook.for(PetTagEntity, 'petId', 'petId')      ◀── auto-injected
// And if reloadAfterCreate: true:
AfterCreateReloadHook.for(PetTagEntity)                ◀── opt-in
```

The trace for any specific resource is reproducible by reading
`buildAppRegistrationPlan` in `rockets-core/src/infrastructure/resource/aggregate-resources.ts`
— it returns the `crudResources`, `entityRegistrations`, and `nestModules`
arrays exactly as listed above before they are spread into Nest's
import/provider lists.

### Composition with `@bitwild/rockets-auth`

You can use both modules **together**, but only if you understand the
shape difference:

- `RocketsAuthModule` (built-in auth) keeps its own
  `repositoryPersistence: { module, entities: { user, userCredentials, … } }`
  shape — intentionally asymmetric. See [ADR 0003](../../docs/explanation/adr/0003-auth-persistence-asymmetry.md).
- `RocketsModule` (this package) uses
  `repository` + `userMetadata` + `resources`.

When both are imported, `RocketsAuthModule` registers the auth
entities; `RocketsModule` adds your application's resources on top.
Order matters: `RocketsAuthModule` first, then `RocketsModule`.

### Architecture

```text
rockets-common         shared utils, zero framework opinion
rockets-repository     abstract data access (no TypeORM, no Firestore)
rockets-crud           generic CRUD
rockets-access-control ACL/RBAC
    ▲
rockets-core           framework primitives
    ▲
rockets-server         ◀── THIS PACKAGE
rockets-server-auth    full auth system (uses both above)
```

### Related documentation

- **Working example:** [`examples/sample-server/`](../../examples/sample-server/)
  — multi-pattern CRUD with external auth
- **Tutorial:** [`docs/tutorials/02-first-external-auth.md`](../../docs/tutorials/02-first-external-auth.md)
- **Architecture flow:** [`docs/diagrams/rockets-architecture-flow.md`](../../docs/diagrams/rockets-architecture-flow.md)
- **How to declare a resource:** [`docs/how-to/crud/declare-a-resource.md`](../../docs/how-to/crud/declare-a-resource.md)
- **How to add an entity:** [`docs/how-to/persistence/add-an-entity.md`](../../docs/how-to/persistence/add-an-entity.md)

---

## License

MIT — see [`../../LICENSE.txt`](../../LICENSE.txt).
