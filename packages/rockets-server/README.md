# @bitwild/rockets

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets)](https://www.npmjs.com/package/@bitwild/rockets)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> External-auth NestJS server. One options object → adapter chain, global guard, `/me`, declarative CRUD resources, swagger.

**Status:** stable (`1.0.0-alpha.9` on npm, dist-tag `alpha`).

**Stack context:** [Repository README](../../README.md#what-problem-each-layer-solves) — Concepta modules are the **motor**; `rockets-core` is the **planner**; **this package** is **Path A** (identity lives outside the app).

---

## 1. Introduction

### The problem this package solves

You already have users somewhere else (Firebase, Okta, a central `@bitwild/rockets-auth` deployment, a custom JWT issuer, API keys). Each new NestJS workflow API still needs the same glue: verify credentials, attach `request.user`, expose `/me`, register CRUD from config, enforce a global guard.

**`@bitwild/rockets` removes that repeated glue** so you pass `auth` + `resources[]` and ship domain code. It does **not** own signup/login tables — that is `@bitwild/rockets-auth` (Path B) or your external IdP.

### What this package is

`@bitwild/rockets` (npm name without the `-server` suffix) is the **external-auth composition layer** on top of `@bitwild/rockets-core`. It does not replace the `@concepta/nestjs-*` motors (repository, CRUD, hooks) — it adds `/me`, the default global guard, and merges `auth` integrations into `RocketsCoreModule`. Use it when your users live in another system (Firebase, Auth0, Okta, a custom JWT issuer, an API-key service).

What it adds on top of core:

- A `MeController` (`GET /me`, `PATCH /me`) that reads the authenticated user and the local `userMetadata` row joined by external id.
- Auto-opt-in for `AuthServerGuard` as the `APP_GUARD` (disable per-instance with `enableGlobalGuard: false`).
- An `auth` option that accepts an `AuthBootstrap` (or array) from `defineFirebaseAuth()`, `defineRocketsAuth()`, or app-local helpers such as `defineSampleAuth()` / `defineApiKeyAuth()`. Each entry may include `forRoot()` when the adapter needs its own Nest module slice.

Everything else (`defineResource`, `defineModuleResource`, hooks, dynamic repositories, swagger registration) is re-exported from core.

### When to use this package

- You authenticate against an external identity provider and want `GET /me` + a global guard out of the box.
- You want to mix multiple auth credentials (e.g. Firebase ID token first, then a server-to-server API key) without writing the chain glue yourself.

### When NOT to use this package

- You want a **complete built-in auth system** (signup, login, password recovery, OTP, oauth, admin user CRUD) → use `@bitwild/rockets-server-auth`.
- You want full composition control (no `/me`, no global guard) → drop to `@bitwild/rockets-core`.

### Stargate micro apps (this package)

When **Stargate** (or your platform team) provisions workflow APIs, each one is a **micro app** on this package:

| Layer | Owner | Rockets surface |
|-------|--------|-----------------|
| Cross-system workflows | Stargate | HTTP steps → your micro app base URL |
| Identity | Once per product (IdP or `@bitwild/rockets-auth`) | `auth: AuthBootstrap` → **same issuer** in every micro app |
| Domain | Squad per micro app | `resources[]`, `repository`, optional Firestore override |

**What `@bitwild/rockets` adds** on top of core (so every micro app shares the same shell):

- `MeController` — `GET /me`, `PATCH /me` + local `userMetadata` row
- `APP_GUARD` → `AuthServerGuard` (opt out with `enableGlobalGuard: false`)
- `auth` chain — `defineFirebaseAuth()`, app-local `AuthBootstrap`, or array of both

Stargate orchestrates; **this package runs the API**. Do not duplicate signup/login DB per generated app.

```
  Stargate (workflows) ──HTTP──▶ Micro app (@bitwild/rockets)
                                        │
                                        ▼
                                 Identity (shared issuer)
```

Example micro app: [sample-code-review](../../examples/sample-code-review/apps/api) (Firebase + API key, mixed SQL/Firestore).

Diagram: [`docs/architecture-diagram.html`](../../docs/architecture-diagram.html). Full pattern: [root README — Stargate, micro apps, and shared auth](../../README.md#stargate-micro-apps-and-shared-auth).

---

## 2. Get Started

### Install

```bash
yarn add @bitwild/rockets@alpha \
  class-transformer class-validator reflect-metadata rxjs
```

`@bitwild/rockets` pulls in `rockets-core`, `rockets-common`, `rockets-access-control`, and the matching `@concepta/nestjs-*` motors transitively (repository + CRUD via `@bitwild/rockets-common`). Add TypeORM (`@concepta/nestjs-repository-typeorm`, `typeorm`, `@nestjs/typeorm`, driver) only when you use SQL. Add other `@bitwild/*` packages only if you import from them directly.

### Minimal working app

A single CRUD resource (`pets`) and a single JWT adapter. The `auth`, `userMetadata`, and `resources` are the three options most apps care about.

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
```

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { RocketsModule, defineResource } from '@bitwild/rockets';
import { JwtAdapter } from './auth/jwt.adapter';
import { PetEntity } from './pet.entity';
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
      }),
      resources: [defineResource({ entity: PetEntity })],
    }),
  ],
})
export class AppModule {}
```

You now have:
- `GET /me` and `PATCH /me` — authenticated user + their metadata.
- `GET/POST/PATCH/DELETE /pets` — CRUD from one bundle definition.
- Global `AuthServerGuard` enforced on every route (opt-out with `@AuthPublic()`).
- Swagger UI registered automatically by core.

---

## 3. How-to Guides

### Run an authentication chain (multiple adapters)

Pass an array. The guard iterates in order. The first adapter that returns `matched: true` wins; if it returns `matched: true; error`, the chain stops and that error is thrown.

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

Order matters: cheap, common credentials first; fallbacks last.

### Disable the global guard for a route or two

Keep the guard global, but tag specific routes public.

```typescript
import { AuthPublic } from '@bitwild/rockets';

@Controller('public')
export class PublicController {
  @Get()
  @AuthPublic()
  health() {
    return { status: 'ok' };
  }
}
```

To disable the guard wholesale (and register it manually elsewhere), pass `enableGlobalGuard: false`.

### Disable the `/me` controller

If your app provides its own user endpoint:

```typescript
RocketsModule.forRoot({
  auth,
  userMetadata,
  repository,
  disableController: { me: true },
});
```

`PATCH /me` validates `userMetadata` against `userMetadata.updateDto` — if you ship that DTO, keep the controller.

### Override the user-metadata handlers

The default `UpsertUserMetadataHandler` and `GetUserMetadataHandler` use the dynamic repository against `userMetadata.entity`. To customise (audit log, side-effects, alternative storage):

```typescript
import {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
} from '@bitwild/rockets';

class MyUpsertHandler extends AbstractUpsertUserMetadataHandler { /* ... */ }
class MyGetHandler extends AbstractGetUserMetadataHandler { /* ... */ }

RocketsModule.forRoot({
  auth, userMetadata, repository,
  handlers: {
    upsertUserMetadata: MyUpsertHandler,
    getUserMetadata: MyGetHandler,
  },
});
```

### Provide an externally-wired auth module

For integrations like Firebase that need their own Nest module (admin SDK, http clients), pass the integration object from the adapter helper:

```typescript
import { defineFirebaseAuth } from '@bitwild/rockets-adapter-firebase';
import { defineModuleResource } from '@bitwild/rockets-core';

RocketsModule.forRoot({
  auth: defineFirebaseAuth({
    forRoot: { firebaseApp: admin.initializeApp({ credential: applicationDefault() }) },
    // forRootAsync: { useFactory: resolveFirebaseOptions, inject: [ConfigService] },
  }),
  userMetadata,
  repository,
  resources: [defineModuleResource({ entities: [UserEntity] })],
});
```

When `forRoot()` is set, core imports the returned module and injects `FirebaseAuthAdapter` from it — the adapter is not double-registered.

### Mix two persistence adapters

Default adapter at the root; per-entity override inside `defineModuleResource`:

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
});
```

---

## 4. Reference

### Upstream engine and siblings

| Layer | Package | Role |
|---|---|---|
| Motor | `@concepta/nestjs-repository`, `crud`, `hook`, … | Runtime behaviour (via `@bitwild/rockets-*` facades) |
| Planner | `@bitwild/rockets-core` | `buildAppRegistrationPlan`, `defineResource`, `AuthServerGuard` |
| **This package** | `@bitwild/rockets` | `RocketsModule`, `MeController`, `APP_GUARD` wiring |
| Built-in identity (path B) | `@bitwild/rockets-auth` | `defineRocketsAuth()` — **sibling**, not a dependency of this package; apps import both |

Path B: `RocketsModule.forRoot({ auth: defineRocketsAuth(...), repository, resources })`.

### `RocketsModule.forRoot(options)` / `forRootAsync(options)`

| Option | Type | Required | Description |
|---|---|---|---|
| `auth` | `AuthBootstrap \| ReadonlyArray<AuthBootstrap>` | yes | From `defineFirebaseAuth()`, `defineRocketsAuth()`, or app-local helpers. Pair entity rows on `resources[]`. |
| `userMetadata` | `RocketsUserMetadataConfig` | yes when `/me` is enabled | `{ entity, createDto, updateDto, responseDto?, repository? }`. Used by `MeController` and the default metadata handlers. |
| `repository` | `RepositoryModuleInterface \| RepositoryBootstrap` | optional | Default persistence adapter forwarded to core. Omit if the auth integration registers everything. |
| `resources` | `ReadonlyArray<ResourceInput>` | optional | Bundles from `defineResource` / `defineModuleResource` / hand-built `RocketsResourceConfig`. |
| `enableGlobalGuard` | `boolean` (default `true`) | optional | Set `false` to skip the `APP_GUARD: AuthServerGuard` provider. |
| `disableController` | `{ me?: boolean }` | optional | Drop `MeController` (or other built-ins added later). |
| `handlers` | `{ upsertUserMetadata?, getUserMetadata? }` | optional | Override the default CQRS handlers for the metadata table. |
| `controllers` | `Type[]` | optional | Replace the default controller list (advanced). |
| `global` | `boolean` (default `false`) | optional | Make this module global. |

### `MeController`

| Route | Description |
|---|---|
| `GET /me` | Returns the authenticated user + their `userMetadata` row (joined by `id`). |
| `PATCH /me` | Validates `body.userMetadata` against `userMetadata.updateDto`, then upserts. |

### Re-exports from `@bitwild/rockets-core`

Everything most apps need:

- Auth: `AuthServerGuard`, `AuthPublic`, `extractBearerToken`, `AUTH_ADAPTERS_TOKEN`, `ROCKETS_DISABLE_GUARDS_TOKEN`.
- Types: `AuthAdapterInterface`, `AuthAttemptResult`, `AuthRequest`, `AuthorizedUser`, `RepositoryPersistenceConfig`, `RocketsUserMetadataConfig`, `RocketsCoreOptionsInterface`, `RocketsCoreOptionsExtrasInterface`, `RocketsCoreSettingsInterface`, all `User*Interface` and `UserMetadata*Interface` shapes.
- Module: `RocketsCoreModule`, `UserModule` (sub-module).
- DTOs: `BaseUserDto`, `BaseUserCreateDto`, `BaseUserUpdateDto`, `BaseUserMetadataDto`, `BaseUserMetadataCreateDto`, `BaseUserMetadataUpdateDto`, `UserUpdateDto`, `UserResponseDto`, `RoleNameDto`, `UserRoleItemDto`.
- User-metadata CQRS: `UpsertUserMetadataCommand`, `AbstractUpsertUserMetadataHandler`, `UpsertUserMetadataHandler`, `GetUserMetadataQuery`, `AbstractGetUserMetadataHandler`, `GetUserMetadataHandler`.
- Resource API: `defineResource`, `defineModuleResource`, `defineSubResource`, `isModuleResource`, `isCrudResource`, `isSubResourceDefinition`, `ResourceKind`, `relation`, `createBoundRelation`, `resolveRelationTarget`, `createPaginatedDto`, `buildAppRegistrationPlan`, `PathScopeHook`, and the full type surface (`AppRegistrationPlan`, `ResourceInput`, `RocketsResourceDefinition`, `ModuleResource`, `CrudResource`, `RelationOptions`, …).
- Tokens: `ROCKETS_CORE_SETTINGS_TOKEN`, `USER_METADATA_MODULE_ENTITY_KEY`, `USER_MODULE_USER_ENTITY_KEY`.
- Exceptions: `RocketsCoreExceptionsFilter` (also exported as `ExceptionsFilter` for back-compat).

### Re-exports from `@bitwild/rockets-common`

`logAndGetErrorDetails`, `getErrorDetails`, `ErrorDetails`.

### Swagger generation

The package ships a CLI helper to dump the OpenAPI spec to disk:

```bash
yarn rockets-swagger > swagger.json
```

Driven by the same `RocketsModule` so the spec reflects the running app's resources.

---

## License

BSD-3-Clause
