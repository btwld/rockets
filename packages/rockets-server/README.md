# @concepta/rockets

[![NPM](https://img.shields.io/npm/v/@concepta/rockets)](https://www.npmjs.com/package/@concepta/rockets)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> External-auth NestJS server. One options object → adapter chain, global guard,
> `/me`, declarative CRUD resources, swagger.

**Status:** pre-1.0 preview. The package manifest is set to `1.0.0-alpha.8`, but
registry publication is pending; install commands below apply after the
`alpha` dist-tag is updated.

**Stack context:**
[Repository README](../../README.md#what-problem-each-layer-solves) — Concepta
modules are the **motor**; `rockets-core` is the **planner**; **this package**
is **Path A** (identity lives outside the app).

---

## 1. Introduction

### The problem this package solves

You already have users somewhere else (Firebase, Okta, a central
`@concepta/rockets-auth` deployment, a custom JWT issuer, API keys). Each new
NestJS workflow API still needs the same glue: verify credentials, attach
`request.user`, expose `/me`, register CRUD from config, enforce a global guard.

**`@concepta/rockets` removes that repeated glue** so you pass `auth` +
`resources[]` and ship domain code. It does **not** own signup/login tables —
that is `@concepta/rockets-auth` (Path B) or your external IdP.

### What this package is

`@concepta/rockets` (npm name without the `-server` suffix) is the
**external-auth composition layer** on top of `@concepta/rockets-core`. It does
not replace the `@concepta/nestjs-*` motors (repository, CRUD, hooks) — it adds
`/me`, the default global guard, and merges `auth` integrations into
`RocketsCoreModule`. Use it when your users live in another system (Firebase,
Auth0, Okta, a custom JWT issuer, an API-key service).

What it adds on top of core:

- The `/me` routes (`GET /me`, `PATCH /me`), built by `buildMeController`
  from your `userMetadata` config, that read the authenticated user and the
  local `userMetadata` row joined by external id.
- Auto-opt-in for `AuthServerGuard` as the `APP_GUARD` (disable per-instance
  with `enableGlobalGuard: false`).
- An `auth` option that accepts an `AuthBootstrap` (or array) from
  `defineFirebaseAuth()`, `defineRocketsAuth()`, or app-local helpers such as
  `defineSampleAuth()` / `defineApiKeyAuth()`. Each entry may include
  `forRoot()` when the adapter needs its own Nest module slice.

The common application surface (`defineResource`, `defineModuleResource`,
`defineSubResource`, owner hooks, dynamic repositories, and Swagger service)
is re-exported from core. Typed non-CRUD HTTP uses `operationResource` from
`@concepta/rockets-core/zod` (or `defineOperationResource` from
`@concepta/rockets-core`). The facade is intentionally curated; advanced
core-only seams stay on `@concepta/rockets-core`.

### When to use this package

- You authenticate against an external identity provider and want `GET /me` + a
  global guard out of the box.
- You want to mix multiple auth credentials (e.g. Firebase ID token first, then
  a server-to-server API key) without writing the chain glue yourself.

### When NOT to use this package

- You want a **complete built-in auth system** (signup, login, password
  recovery, OTP, invitations, admin user CRUD) → use
  `@concepta/rockets-auth` alongside this package.
- You want full composition control (no `/me`, no global guard) → drop to
  `@concepta/rockets-core`.

### Stargate micro apps (this package)

When **Stargate** (or your platform team) provisions workflow APIs, each one is
a **micro app** on this package:

| Layer                  | Owner                                             | Rockets surface                                            |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Cross-system workflows | Stargate                                          | HTTP steps → your micro app base URL                       |
| Identity               | Once per product (IdP or `@concepta/rockets-auth`) | `auth: AuthBootstrap` → **same issuer** in every micro app |
| Domain                 | Squad per micro app                               | `resources[]`, `repository`, optional Firestore override   |

**What `@concepta/rockets` adds** on top of core (so every micro app shares the
same shell):

- `/me` routes (`buildMeController`) — `GET /me`, `PATCH /me` + local
  `userMetadata` row
- `APP_GUARD` → `AuthServerGuard` (opt out with `enableGlobalGuard: false`)
- `auth` chain — `defineFirebaseAuth()`, app-local `AuthBootstrap`, or array of
  both

Stargate orchestrates; **this package runs the API**. Do not duplicate
signup/login DB per generated app.

```text
  Stargate (workflows) ──HTTP──▶ Micro app (@concepta/rockets)
                                        │
                                        ▼
                                 Identity (shared issuer)
```

Example micro app:
[sample-code-review](../../examples/sample-code-review/apps/api) (Firebase + API
key, mixed SQL/Firestore).

Diagram:
[`docs/architecture-diagram.html`](../../docs/architecture-diagram.html). Full
pattern:
[root README — Stargate, micro apps, and shared auth](../../README.md#stargate-micro-apps-and-shared-auth).

---

## 2. Get Started

### Install

```bash
yarn add @concepta/rockets@alpha reflect-metadata rxjs
```

`@concepta/rockets` pulls in `rockets-core`, `zod` (the schema engine — no
`class-validator` / `class-transformer` needed) and the matching
`@concepta/nestjs-*` motors transitively (repository + CRUD re-exported by
`@concepta/rockets-core`).
Add TypeORM (`@concepta/rockets-repository-typeorm@alpha`, `typeorm`, `@nestjs/typeorm`,
driver) only when you use SQL. Add other `@concepta/*` packages only if you import
from
them directly.

### Minimal working app

A single CRUD resource (`pets`) and a single JWT adapter. `createServer()` is
the canonical launch-facing API; it returns a Nest entry module that can be
passed straight to `NestFactory.create()`.

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

```typescript
// src/server.ts
import { NestFactory } from '@nestjs/core';
import { createServer, defineResource } from '@concepta/rockets';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';
import { jwtAuth } from './auth/jwt.adapter';
import { PetEntity } from './pet.entity';
// defineUserMetadata(userMetadataSchema) → { entity, updateSchema, responseSchema }
import { userMetadataConfig } from './user/user-metadata.schema';

export const server = createServer({
  auth: jwtAuth,
  userMetadata: userMetadataConfig,
  repository: defineTypeOrmRepository({
    type: 'sqlite',
    database: ':memory:',
    synchronize: true,
  }),
  resources: [defineResource({ entity: PetEntity })],
});

// main.ts
const app = await NestFactory.create(server);
await app.listen(3000);
```

You now have:

- `GET /me` and `PATCH /me` — authenticated user + their metadata.
- `GET/POST/PATCH/DELETE /pets` — CRUD from one bundle definition.
- Global `AuthServerGuard` enforced on every route (opt-out with
  `@AuthPublic()`).
- Swagger UI registered automatically by core.

---

## 3. How-to Guides

### Run an authentication chain (multiple adapters)

Pass an array. The guard iterates in order. The first adapter that returns
`matched: true` wins; if it returns `matched: true; error`, the chain stops and
that error is thrown.

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

Order matters: cheap, common credentials first; fallbacks last.

### Disable the global guard for a route or two

Keep the guard global, but tag specific routes public.

```typescript
import { AuthPublic } from '@concepta/rockets';

@Controller('public')
export class PublicController {
  @Get()
  @AuthPublic()
  health() {
    return { status: 'ok' };
  }
}
```

To disable the guard wholesale (and register it manually elsewhere), pass
`enableGlobalGuard: false`.

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

`PATCH /me` validates `body.userMetadata` against `userMetadata.updateSchema`
and both routes serialize through `userMetadata.responseSchema` — if you
ship those schemas, keep the controller. To mount it yourself (for example
to list it in `routePolicy.allowControllers`, which needs a class
reference), call `buildMeController(userMetadataConfig)` once and pass the
returned class through `controllers:`.

### Override the user-metadata handlers

The default `UpsertUserMetadataHandler` and `GetUserMetadataHandler` use the
dynamic repository against `userMetadata.entity`. To customise (audit log,
side-effects, alternative storage):

```typescript
import {
  AbstractUpsertUserMetadataHandler,
  AbstractGetUserMetadataHandler,
} from '@concepta/rockets';

class MyUpsertHandler extends AbstractUpsertUserMetadataHandler {
  /* ... */
}
class MyGetHandler extends AbstractGetUserMetadataHandler {
  /* ... */
}

RocketsModule.forRoot({
  auth,
  userMetadata,
  repository,
  handlers: {
    upsertUserMetadata: MyUpsertHandler,
    getUserMetadata: MyGetHandler,
  },
});
```

### Provide an externally-wired auth module

For integrations like Firebase that need their own Nest module (admin SDK, http
clients), pass the integration object from the adapter helper:

```typescript
import { defineFirebaseAuth } from '@concepta/rockets-adapter-firebase';
import { defineModuleResource } from '@concepta/rockets-core';

RocketsModule.forRoot({
  auth: defineFirebaseAuth({
    firebaseApp: admin.initializeApp({ credential: applicationDefault() }),
    // forRootAsync: { useFactory: resolveFirebaseOptions, inject: [ConfigService] },
  }),
  userMetadata,
  repository,
  resources: [defineModuleResource({ entities: [UserEntity] })],
});
```

When `forRoot()` is set, core imports the returned module and injects
`FirebaseAuthAdapter` from it — the adapter is not double-registered.

### Mix two persistence adapters

Default adapter at the root; per-entity override inside `defineModuleResource`:

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
});
```

---

## 4. Reference

### Upstream engine and siblings

| Layer                      | Package                                          | Role                                                                                    |
| -------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Motor                      | `@concepta/nestjs-repository`, `crud`, `hook`, … | Runtime behaviour (via `@concepta/rockets-*` facades)                                    |
| Planner                    | `@concepta/rockets-core`                          | `buildAppRegistrationPlan`, `defineResource`, `AuthServerGuard`                         |
| **This package**           | `@concepta/rockets`                               | `RocketsModule`, `buildMeController` (`/me`), `APP_GUARD` wiring                        |
| Built-in identity (path B) | `@concepta/rockets-auth`                          | `defineRocketsAuth()` — **sibling**, not a dependency of this package; apps import both |

Path B: `createServer({ auth: defineRocketsAuth(...), resources })`. The auth
integration contributes its persistence rows, root repository, metadata
contract, and guard preference; explicit server options still win.

### `createServer(definition)`

The canonical public facade. It accepts the same static definition as
`RocketsModule.forRoot()` and returns a Nest `DynamicModule`. Pass it directly
to `NestFactory.create()` or import it into a larger host module. Use
`RocketsModule.forRootAsync()` only when the host itself must build the whole
definition asynchronously.

### `RocketsModule.forRoot(options)` / `forRootAsync(options)`

| Option              | Type                                               | Required                  | Description                                                                                                              |
| ------------------- | -------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `auth`              | `AuthBootstrap \| ReadonlyArray<AuthBootstrap>`    | yes                       | From `defineFirebaseAuth()`, `defineRocketsAuth()`, or app-local helpers. Integrations may contribute owned defaults.    |
| `userMetadata`      | `RocketsUserMetadataConfig`                        | optional                  | When present, mounts `/me` and its metadata handlers. Explicit configuration overrides an auth contribution.            |
| `repository`        | `RepositoryModuleInterface \| RepositoryBootstrap` | optional                  | Default persistence adapter forwarded to core. Omit if the auth integration registers everything.                        |
| `resources`         | `ReadonlyArray<ResourceInput>`                     | optional                  | Bundles from `defineResource` / `defineModuleResource` / `defineSubResource` / `defineOperationResource` / `operationResource` / hand-built `RocketsResourceConfig`. |
| `enableGlobalGuard` | `boolean` (default `true`)                         | optional                  | Set `false` to skip the `APP_GUARD: AuthServerGuard` provider.                                                           |
| `disableController` | `{ me?: boolean }`                                 | optional                  | Skip the built `/me` controller (`buildMeController`) — or other built-ins added later.                                  |
| `handlers`          | `{ upsertUserMetadata?, getUserMetadata? }`        | optional                  | Override the default CQRS handlers for the metadata table.                                                               |
| `controllers`       | `Type[]`                                           | optional                  | Replace the default controller list (advanced).                                                                          |
| `global`            | `boolean` (default `false`)                        | optional                  | Make this module global.                                                                                                 |

### `buildMeController(config)` — the `/me` routes

A factory, not a static class: both schemas depend on the app's
`userMetadata` config. `RocketsModule` calls it for you unless
`disableController.me` is set; call it yourself only when you mount the
controller through `controllers:`. Request/response components are
`UserUpdateDto` / `UserResponseDto` (`meUpdateSchema` / `meResponseSchema`,
also exported), nesting your metadata schemas by `$ref`.

| Route       | Description                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /me`   | Returns the authenticated user + their `userMetadata` row (joined by `id`; `null` before the first `PATCH`).      |
| `PATCH /me` | Validates `body.userMetadata` against `userMetadata.updateSchema` (`400` with `details`), then upserts.           |

Both routes serialize through `userMetadata.responseSchema`, so a column
hidden from the response projection never leaves `/me` either.

### Curated re-exports from `@concepta/rockets-core`

Everything most external-auth apps need:

- Auth: `AuthServerGuard`, `AuthPublic`, `extractBearerToken`,
  `AUTH_ADAPTERS_TOKEN`. (Reading the `AuthPublic` metadata back is
  `isAuthPublic()` from `@concepta/nestjs-authentication` — Rockets no
  longer mirrors upstream's metadata key.)
- Types: `AuthAdapterInterface`, `AuthAttemptResult`, `AuthRequest`,
  `AuthorizedUser`, `RepositoryPersistenceConfig`, `RocketsUserMetadataConfig`,
  `RocketsCoreOptionsInterface`, `RocketsCoreOptionsExtrasInterface`,
  `RocketsCoreSettingsInterface`, all `User*Interface` and
  `UserMetadata*Interface` shapes.
- Module: `RocketsCoreModule`, `UserModule` (sub-module).
- `/me` schema factories (this package's own): `buildMeController`,
  `meUpdateSchema`, `meResponseSchema`.
- User-metadata CQRS: `UpsertUserMetadataCommand`,
  `AbstractUpsertUserMetadataHandler`, `UpsertUserMetadataHandler`,
  `GetUserMetadataQuery`, `AbstractGetUserMetadataHandler`,
  `GetUserMetadataHandler`.
- Resource API: `defineResource`, `defineModuleResource`, `defineSubResource`,
  `isModuleResource`, `isCrudResource`, `isSubResourceDefinition`,
  `ResourceKind`, `relation`, `createBoundRelation`, `resolveRelationTarget`,
  `buildAppRegistrationPlan`, `PathScopeHook`, and the
  full type surface (`AppRegistrationPlan`, `ResourceInput`,
  `RocketsResourceDefinition`, `ModuleResource`, `CrudResource`,
  `RelationOptions`, …).
- Tokens: `ROCKETS_CORE_SETTINGS_TOKEN`, `USER_METADATA_MODULE_ENTITY_KEY`,
  `USER_MODULE_USER_ENTITY_KEY`.
- Exceptions: `RocketsCoreExceptionsFilter` (also exported as `ExceptionsFilter`
  for back-compat).
- Error helpers: `logAndGetErrorDetails`, `getErrorDetails`, `ErrorDetails`.

This is an explicit facade, not an `export *` compatibility promise. Import
the following advanced seams from `@concepta/rockets-core` directly:

- Operation resources: `defineOperationResource`, `isOperationResource`, and
  types such as `OperationResource` / `OperationResourceDefinition`. Prefer
  `operationResource` from `@concepta/rockets-core/zod` for Zod authoring.
- Context/CRUD internals: `ActorOverlay`, `AppContextHost`, `AppContextLike`,
  `AuthUserCtx`, `AuthUserContextOverlay`, `getAppContext`,
  `CrudCommandHandlerBase`, `CrudQueryHandlerBase`, `CrudCommandInterface`,
  `CrudQueryInterface`, `ByIdInterface`, `CreateOneInterface`,
  `UpdateOneInterface`, `RemoveOneInterface`, and `InjectCrudAdapter`.
- Advanced auth/access control: `AuthBootstrapContributions`,
  `AuthBootstrapIdentity`, `AuthPublicMetadata`, `AuthPublicOptions`,
  `RocketsAccessControlConfig`, and `buildAccessControlImport`.
- Hook/resource construction: `AfterCreateReloadHook`, `defineHook`,
  `EntityHookFns`, `EntityHookLifecycleKey`, `EntityHookTools`,
  `RocketsEntityHookForResource`, `OwnedEntity`, `OwnerStampHookOptions`,
  `PathScopeGuard`, `RocketsResourceConfig`, `DEFAULT_OWNER_COLUMN`, and
  `defaultParentParam`.
- Schema engine: `withOpenApi`, `rocketsSchemaValidation`,
  `assertNamedSchema`, `assertFailClosedResponse`, `buildPaginatedSchema`,
  `paginatedSchema`, `createBatchSchema`, `readSchemaId`,
  `isOpenApiBridged`, `createRocketsStandardSchemaConverter`,
  `SchemaValidatorConflictCheck`, and `validateWithSchema`.
- Swagger and low-level utilities: `SwaggerUiModule`,
  `SwaggerUiOptionsInterface`, `SwaggerUiSettingsInterface`,
  `ERROR_MESSAGE_FALLBACK`, `deriveEntityKey`, `resolveEntityKey`, and
  `stripUndefined`.

The repository's [public API policy](../../api/public-api-policy.md) and
committed declaration report guard this boundary. Any intentional addition,
removal, or signature change must update the report and its documentation or
migration note in the same change.

### OpenAPI generation

OpenAPI is app-owned because only the application knows its complete entry
module, global prefixes, and document settings. Build the document from the
same `server` definition with Nest's `SwaggerModule.createDocument(app,
config)`. The runnable samples demonstrate both Swagger UI and document
post-processing; the packages do not expose a misleading standalone CLI.

---

## Final Review Checklist

Start with the
[root checklist](../../README.md#final-review-checklist), then verify the
external-auth server rules:

- Keep this package focused on Path A: auth chain composition, default global
  guard, `/me`, and metadata handlers.
- Do not add signup/login/OTP/role-admin behavior here. Built-in identity
  belongs in `@concepta/rockets-auth`.
- Keep auth adapters responsible for identity resolution only. Resource
  ownership and app authorization stay in resource hooks, guards, or app policy
  code.
- Keep `/me` tied to `userMetadata.entity` through dynamic repositories; do not
  hard-code a storage adapter.
- If `RocketsModule.forRoot` / `forRootAsync` behavior changes, update both
  docs and e2e coverage.
- Run `yarn build`, `yarn typecheck:spec`, `yarn test`, `yarn test:e2e`, and
  `yarn lint:all` from the
  repository root.

---

## License

BSD-3-Clause
