# @bitwild/rockets-access-control

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-access-control)](https://www.npmjs.com/package/@bitwild/rockets-access-control)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Role-based access control (RBAC) with grant rules per action / possession, on top of [`accesscontrol`](https://www.npmjs.com/package/accesscontrol).

**Status:** stable (`1.0.0-alpha.9` on npm, dist-tag `alpha`), but lagging — wraps `@concepta/nestjs-access-control@7.0.0-alpha.10`. The upstream v8 port is on the roadmap; the public API surface is expected to stay the same.

---

## 1. Introduction

`@bitwild/rockets-access-control` is the Rockets import path for the **RBAC motor**: `@concepta/nestjs-access-control` (re-export only — no forked logic).

It owns the ACL part of Rockets: a grant table, a guard that enforces it, decorators that declare the rule on each route, and the hooks an app implements to feed the guard with users and roles.

### What it gives you

- `AccessControlModule.forRoot(options)` / `forRootAsync(options)` — registers the grant table (`rules`) and the `AccessControlServiceInterface` implementation.
- `AccessControlGuard` — enforces the declared rule on the current route.
- Operation decorators: `@AccessControlCreateOne`, `@AccessControlReadOne`, `@AccessControlReadMany`, `@AccessControlUpdateOne`, `@AccessControlReplaceOne`, `@AccessControlDeleteOne`, `@AccessControlRecoverOne`, `@AccessControlCreateMany`, `@AccessControlQuery`, `@AccessControlGrant`.
- `AccessControlServiceInterface` — the contract you implement to expose user + roles to the guard.
- `CanAccess` — the contract for query-based custom checks (ownership, tenant scope, status flags).
- Enums: `ActionEnum` (aliased as `AccessControlAction`), `PossessionEnum`.

### When to use this package

- You need RBAC with multiple roles per user and "own vs. any" ownership semantics on the same resource.
- You are integrating with `@bitwild/rockets-server-auth` (which uses this for built-in role management).

### When NOT to use this package

- You only need bearer-token auth and a global guard — `AuthServerGuard` from `@bitwild/rockets-core` already does that.
- You only have one role tier (logged-in / logged-out) — pair `AuthServerGuard` with `@AuthPublic()` and stop there.

---

## 2. Get Started

### Install

```bash
yarn add @bitwild/rockets-access-control@alpha @bitwild/rockets-common@alpha \
  accesscontrol @nestjs/common reflect-metadata
```

### Define the grant table

```typescript
// src/access-control/app.acl.ts
import { ActionEnum, PossessionEnum } from '@bitwild/rockets-access-control';

export const APP_ACL = {
  user: {
    pet: {
      'create:own': ['*'],
      'read:own':   ['*'],
      'update:own': ['*'],
      'delete:own': ['*'],
    },
  },
  manager: {
    $extend: ['user'],
    pet: {
      'read:any':   ['*'],
      'update:any': ['*'],
    },
  },
  admin: {
    $extend: ['manager'],
    pet: {
      'delete:any': ['*'],
    },
  },
};
```

### Provide users + roles to the guard

```typescript
// src/access-control/ac.service.ts
import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AccessControlServiceInterface } from '@bitwild/rockets-access-control';

@Injectable()
export class AcService implements AccessControlServiceInterface {
  async getUser<T>(ctx: ExecutionContext): Promise<T> {
    return ctx.switchToHttp().getRequest().user as T;
  }

  async getUserRoles(ctx: ExecutionContext): Promise<string[]> {
    const user = await this.getUser<{ userRoles?: { role: { name: string } }[] }>(ctx);
    if (!user) throw new UnauthorizedException();
    return user.userRoles?.map((ur) => ur.role.name) ?? [];
  }
}
```

The `userRoles` shape lines up with `AuthorizedUser` from `@bitwild/rockets-core`, so any adapter that follows that contract feeds the ACL guard with zero glue.

### Register the module

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  AccessControlModule,
  AccessControlGuard,
} from '@bitwild/rockets-access-control';

import { APP_ACL } from './access-control/app.acl';
import { AcService } from './access-control/ac.service';

@Module({
  imports: [
    AccessControlModule.forRoot({
      settings: { rules: APP_ACL },
      service: AcService,
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: AccessControlGuard }],
})
export class AppModule {}
```

Register the guard globally with `APP_GUARD`, or per-controller via `@UseGuards(AccessControlGuard)` if you want to opt in route-by-route.

---

## 3. How-to Guides

### Mark a route with the required grant

Use the operation-specific decorator. The first argument is the resource name (matches the key in the grant table); the second is the possession (own / any).

```typescript
import {
  AccessControlReadOne,
  AccessControlDeleteOne,
} from '@bitwild/rockets-access-control';

@Controller('pets')
export class PetController {
  @Get(':id')
  @AccessControlReadOne('pet')
  read(@Param('id') id: string) { /* ... */ }

  @Delete(':id')
  @AccessControlDeleteOne('pet')
  remove(@Param('id') id: string) { /* ... */ }
}
```

The grant table decides whether the action runs under `:own` (ownership-checked) or `:any` (unscoped).

### Implement a custom `:own` ownership check

Provide a `CanAccess` service in `@AccessControlQuery` to refine the rule the guard already matched.

```typescript
import {
  CanAccess,
  AccessControlContextInterface,
  AccessControlQuery,
} from '@bitwild/rockets-access-control';

@Injectable()
export class PetAccessQuery implements CanAccess {
  constructor(private readonly pets: PetService) {}

  async canAccess(ctx: AccessControlContextInterface): Promise<boolean> {
    const { action, possession } = ctx.getQuery();
    if (possession === 'any') return true;

    const user = ctx.getUser() as { id?: string };
    const id = ctx.getExecutionContext().switchToHttp().getRequest().params.id;
    if (!id) return true;                          // list — service filters by userId

    const pet = await this.pets.byId(id);
    return Boolean(pet && pet.userId === user.id);
  }
}

@Controller('pets')
export class PetController {
  @Get(':id')
  @AccessControlReadOne('pet')
  @AccessControlQuery({ service: PetAccessQuery })
  read(@Param('id') id: string) { /* ... */ }
}
```

`AccessControlGuard` only calls `canAccess()` after the grant table has already matched — your service refines the rule, it does not replace it.

### Add per-route grants without touching the table

`@AccessControlGrant` declares an inline grant when the table-driven model does not fit a special-case route.

```typescript
import { AccessControlGrant } from '@bitwild/rockets-access-control';

@Post('export')
@AccessControlGrant({ resource: 'pet', action: 'read', possession: 'any' })
export() { /* ... */ }
```

Use sparingly — the table is the source of truth.

### Alias the action enum to avoid name clashes

`ActionEnum` is also exported as `AccessControlAction`. Import the alias when you also import `Operation` from `@bitwild/rockets-common` (which exports its own `ActionEnum`).

```typescript
import { AccessControlAction } from '@bitwild/rockets-access-control';
import { ActionEnum as OperationActionEnum } from '@bitwild/rockets-common';
```

---

## 4. Reference

### Upstream engine

**Motor:** `@concepta/nestjs-access-control` — grant table, `AccessControlGuard`, operation decorators, `CanAccess`.

**This package:** `@bitwild/rockets-access-control` — same API, Rockets-scoped import. `@bitwild/rockets-core` depends on it; apps using path B often import ACL symbols from `@bitwild/rockets-auth` instead.

**Not the auth motor:** bearer validation is `AuthServerGuard` + `AuthAdapterInterface` in core — ACL runs after a user is known (optional per app).

### Module

| Member | Purpose |
|---|---|
| `AccessControlModule.forRoot({ settings, service })` | Sync registration. `settings.rules` is the grant table; `service` is the `AccessControlServiceInterface` implementation. |
| `AccessControlModule.forRootAsync({ useFactory, inject })` | Async registration (e.g. pull rules from config). |
| `AccessControlModule.forFeature(options)` | Feature-scoped registration (rare; usually `forRoot` is enough). |
| `AccessControlModule.register(...)` / `registerAsync(...)` | Legacy aliases for `forRoot` / `forRootAsync`. |

### Guard

| Symbol | Purpose |
|---|---|
| `AccessControlGuard` | Enforces the declared rule. Register globally via `APP_GUARD` or per-controller via `@UseGuards`. |

### Operation decorators

| Decorator | Maps to |
|---|---|
| `@AccessControlReadOne(resource)` | `read:own` / `read:any` |
| `@AccessControlReadMany(resource)` | `read:any` (list) |
| `@AccessControlCreateOne(resource)` | `create:own` / `create:any` |
| `@AccessControlCreateMany(resource)` | `create:any` (batch) |
| `@AccessControlUpdateOne(resource)` | `update:own` / `update:any` |
| `@AccessControlReplaceOne(resource)` | `update:any` (PUT) |
| `@AccessControlDeleteOne(resource)` | `delete:own` / `delete:any` |
| `@AccessControlRecoverOne(resource)` | `update:any` (soft-delete restore) |
| `@AccessControlQuery({ service })` | Attach a `CanAccess` service for query refinement. |
| `@AccessControlGrant(query)` | Inline ad-hoc grant. |

### Interfaces

| Type | Purpose |
|---|---|
| `AccessControlServiceInterface` | App contract: `getUser`, `getUserRoles`. |
| `AccessControlContextInterface` | Provided to `CanAccess.canAccess()`: query, user, exec context. |
| `CanAccess` | Custom query-time check (ownership, tenant). |
| `AccessControlOptionsInterface` | Shape of `forRoot/forRootAsync` options. |
| `AccessControlMetadataInterface` | Reflector metadata payload for the operation decorators. |
| `AccessControlGrantOptionInterface`, `AccessControlQueryOptionInterface` | Inputs to `@AccessControlGrant` / `@AccessControlQuery`. |

### Enums

| Enum | Members |
|---|---|
| `ActionEnum` / `AccessControlAction` | `create`, `read`, `update`, `delete`. |
| `PossessionEnum` | `own`, `any`. |

### Service surface

| Symbol | Purpose |
|---|---|
| `AccessControlService` | Internal facade over `accesscontrol`. Inject when you want to evaluate grants outside a guard. |
| `AccessControlContext` | Built by the guard, passed to `CanAccess`. |
| `AccessControlFilter` | Post-query data filtering primitive (apply allowed attributes to a result). |

### Exceptions

| Symbol | Purpose |
|---|---|
| `AccessControllerException` | Thrown when the guard / service rejects access. |

---

## License

BSD-3-Clause
