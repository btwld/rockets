# @bitwild/rockets-core

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-core)](https://www.npmjs.com/package/@bitwild/rockets-core)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Configuration-driven composition layer: one options object → planner → upstream `@concepta/nestjs-*` modules registered as Nest imports.

**Stack context:** [Repository README](../../README.md#what-problem-each-layer-solves) — Concepta = motor; **this package** = planner; `@bitwild/rockets` / `@bitwild/rockets-auth` = Path A / Path B entry points.

---

## 1. Introduction

`@bitwild/rockets-core` is the **planner and wiring layer** — not the repository/CRUD/hook motor. It solves: *“I already use Concepta motors, but I still hand-wire Nest modules, entity lists, and auth guards on every new service.”* The motor is `@concepta/nestjs-repository`, `@concepta/nestjs-crud`, and `@concepta/nestjs-hook` (imported via `@bitwild/rockets-repository`, `@bitwild/rockets-crud`, `@bitwild/rockets-common`). Core owns:

- An auth contract (`AuthAdapterInterface`) and a global guard that runs adapters in a chain.
- A resource planner (`buildAppRegistrationPlan`) that turns a list of feature bundles into Nest imports, dynamic repository registrations, and CRUD controllers.
- Reusable repository hooks for owner scoping, audit, and path-scoped sub-resources.
- A typed actor overlay so handlers can read the authenticated user without parameter drilling.

### When to use this package

- You want full control over composition (no `/me` route, no global guard defaults) and will write a thin server module yourself.
- You are building another package (an adapter, a presentation layer) that needs the same contracts as `@bitwild/rockets` and `@bitwild/rockets-auth`.

### When NOT to use this package

- You want an external-auth server with `/me` and a global guard out of the box → use `@bitwild/rockets`.
- You want a complete built-in auth system (signup, login, OTP, admin) → use `@bitwild/rockets-auth`.

Both packages above re-export almost everything in core, so you usually depend on one of them — not on core directly.

---

## 2. Get Started

### Install

```bash
yarn add @bitwild/rockets-core \
  @nestjs/common @nestjs/core @nestjs/cqrs @nestjs/swagger \
  class-transformer class-validator
```

### Minimal working example

A bare app with one auth adapter and one CRUD resource. No HTTP controller code — the controller is generated from `defineResource`.

```typescript
// src/auth/jwt.adapter.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verify } from 'jsonwebtoken';
import {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
  extractBearerToken,
} from '@bitwild/rockets-core';

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
import { APP_GUARD } from '@nestjs/core';
import {
  RocketsCoreModule,
  AuthServerGuard,
  defineResource,
} from '@bitwild/rockets-core';
import { JwtAdapter } from './auth/jwt.adapter';
import { PetEntity } from './pet.entity';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';

@Module({
  imports: [
    RocketsCoreModule.forRoot({
      auth: JwtAdapter,
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
      }),
      resources: [defineResource({ entity: PetEntity })],
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
})
export class AppModule {}
```

### What just happened

- `auth: JwtAdapter` registered the adapter as a provider; core exposes the ordered chain on `AUTH_ADAPTERS_TOKEN` for `AuthServerGuard`.
- `repository: defineTypeOrmRepository(...)` is the only place that mentions TypeORM. The planner collects entities from `resources[]` and registers them.
- `defineResource({ entity: PetEntity })` produced `GET/POST/PATCH/DELETE /pets` with validation and Swagger schema. No controller was written.

`defineTypeOrmRepository` is a small app-local `RepositoryBootstrap` wrapper (TypeORM connection options + planner-derived entity list). Keep it in the sample app (or copy into yours) — do not pull TypeORM into `@bitwild/rockets-core` or sibling packages.

---

## 3. How-to Guides

### Add a non-CRUD feature (controller + service + entity)

Use `defineModuleResource` when a feature needs its own Nest wiring or a junction table without auto-generated CRUD.

```typescript
import { defineModuleResource } from '@bitwild/rockets-core';

export const billingFeature = defineModuleResource({
  entities: [InvoiceEntity],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService], // only what other bundles inject
});
```

`RocketsCoreModule` is global, so anything in `exports` is visible app-wide. Export the minimum to avoid name collisions across bundles.

### Scope rows to the authenticated user

`OwnerStampHook` writes `userId` on create/update and rejects spoofing. `OwnerScopeHook` filters list/read/update/delete by `userId`. Both default to a `userId` column; pass a second argument to override.

```typescript
import { OwnerStampHook, OwnerScopeHook } from '@bitwild/rockets-core';

defineResource({
  entity: PetEntity,
  hooks: [OwnerStampHook.for(PetEntity), OwnerScopeHook.for(PetEntity)],
});
```

The hooks run at the repository layer, so direct (non-HTTP) calls are scoped too.

### Mix two persistence adapters

The default adapter goes in `repository:`. Override per entity inside `defineModuleResource`:

```typescript
import { defineModuleResource } from '@bitwild/rockets-core';
import { FirestoreRepositoryModule } from '@bitwild/rockets-repository-firestore';

defineModuleResource({
  entities: [
    { entity: AnalyticsEventEntity, repository: FirestoreRepositoryModule },
  ],
});
```

The default bootstrap owns its entity set; the override-only entities go to the override's module.

### Inject a dynamic repository

The string key is derived from the entity name (`PetEntity` → `'pet'`). Pass the class for the recommended form, or an explicit string for namespaced keys.

```typescript
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';

@Injectable()
export class PetService {
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly pets: RepositoryInterface<PetEntity>,
  ) {}

  byOwner(ownerId: string) {
    return this.pets.find({ where: Where.eq<PetEntity>('userId', ownerId) });
  }
}
```

### Read the authenticated user inside a handler

CRUD-generated controllers do not expose method signatures you can decorate. Use `getActor(context)` inside command/query handlers.

```typescript
import { CommandHandler } from '@nestjs/cqrs';
import { getActor } from '@bitwild/rockets-core';

@CommandHandler(CrudCreateCommand)
export class PetCreateHandler {
  execute(cmd: CrudCreateCommand) {
    const actor = getActor(cmd.context);
    // actor.id, actor.email, actor.userRoles
  }
}
```

### Mark a route as public

The global `AuthServerGuard` skips routes tagged with `@AuthPublic`.

```typescript
import { Controller, Get } from '@nestjs/common';
import { AuthPublic } from '@bitwild/rockets-core';

@Controller('health')
export class HealthController {
  @Get()
  @AuthPublic()
  ok() {
    return { status: 'ok' };
  }
}
```

---

## 4. Reference

### Upstream engine

| Motor (`@concepta/nestjs-*`) | Facade in this monorepo | What core does with it |
|---|---|---|
| `repository` | `@bitwild/rockets-repository` | `buildAppRegistrationPlan` calls `repository.forRoot(entities)` and `forFeature` per resource row |
| `crud` | `@bitwild/rockets-crud` | Each `defineResource` becomes a `CrudModule.forFeature` import |
| `hook`, `common`, `authentication`, `swagger-ui` | `@bitwild/rockets-common` | `HookModule.forRoot` in `createCoreImports`; swagger from options |
| `access-control` | `@bitwild/rockets-access-control` | Optional; apps register `AccessControlModule` when they need RBAC |

Core **does not** fork upstream behaviour — it only expands `resources[]`, `userMetadata`, and `auth` integrations into the module graph those packages expect.

### `RocketsCoreModule.forRoot(options)`

| Option | Type | Required | Description |
|---|---|---|---|
| `auth` | `Type<AuthAdapterInterface>` or array | optional† | Adapter class (or chain). Auto-registered as provider; `AUTH_ADAPTERS_TOKEN` aliased via `useExisting`. |
| `authExternallyProvided` | `boolean` (default `false`) | optional | Set `true` when the adapter is already provided by an external Nest module (e.g. `FirebaseAuthModule`). |
| `repository` | `RepositoryModuleInterface` or `RepositoryBootstrap` | optional | Default persistence adapter. A bootstrap owns both `forRoot(entities)` and `forFeature(entities)`. |
| `userMetadata` | `RocketsUserMetadataConfig` | optional | Entity + DTOs for the metadata table joined to external users. |
| `resources` | `ReadonlyArray<ResourceInput>` | optional | Mix of `defineResource`, `defineModuleResource`, and manual `RocketsResourceConfig`. |
| `handlers` | `{ upsertUserMetadata?, getUserMetadata? }` | optional | Override default metadata CQRS handlers. |
| `providers` | `Provider[]` | optional | Extra providers registered on the module. |
| `global` | `boolean` (default `true`) | optional | Module is global — exports visible app-wide. |

† `auth` is required at the presentation layer (e.g. `@bitwild/rockets` always needs an auth source). Core itself boots without it for tests.

### `AuthAdapterInterface`

```typescript
interface AuthAdapterInterface {
  authenticate(request: AuthRequest): Promise<AuthAttemptResult>;
}

type AuthAttemptResult =
  | { matched: false }                                 // not this adapter's credential
  | { matched: true; user: AuthorizedUser }            // recognised and validated
  | { matched: true; error: HttpException };           // recognised but rejected

interface AuthorizedUser {
  id: string;
  sub: string;
  email?: string;
  userRoles?: { role: { name: string } }[];   // shape required for RBAC
  claims?: Record<string, unknown>;
}
```

The guard iterates adapters in order. `{ matched: false }` → try next. `{ matched: true; user }` → stop, attach user. `{ matched: true; error }` → stop, throw.

### Helpers

| Symbol | Purpose |
|---|---|
| `defineResource(input)` | CRUD bundle: entity + DTOs + operations + hooks → auto-controller. |
| `defineModuleResource(input)` | Non-CRUD bundle: entities + Nest module slice. |
| `defineSubResource(input)` | Nested resource (e.g. `/pets/:petId/tags`) with path-scope guard. |
| `defineAuthFeature(input)` | Adapter + entities + controllers in one bundle. |
| `relation(target, prop, opts?)` | Type-safe cross-resource relation. |
| `extractBearerToken(request)` | RFC 7235 Bearer parser for adapter implementations. |
| `getActor(ctx)` | Read authenticated user from a CRUD context. |
| `getCrudContext(ctx)` | Read the full CRUD context (request, params, …). |
| `OwnerStampHook.for(Entity, column?)` | Stamp `userId` on create/update. |
| `OwnerScopeHook.for(Entity, column?)` | Filter list/read/update/delete by `userId`. |
| `AfterCreateReloadHook.for(Entity)` | Reload an entity after create (for eager relations). |
| `PathScopeHook.for(Entity, paramName, fkColumn)` | Filter sub-resource by parent URL param. |
| `PathScopeGuard.for(paramName, parentKey, ownerColumn)` | Verify actor owns the parent. |
| `AuthServerGuard` | Bearer-token / multi-adapter guard. Opt-in via `APP_GUARD`. |
| `@AuthPublic()` | Decorator to skip the global guard on a route. |
| `AUTH_ADAPTERS_TOKEN` | Inject the configured adapter chain. |

---

## License

BSD-3-Clause
