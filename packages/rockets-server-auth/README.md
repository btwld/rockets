# `@bitwild/rockets-auth`

[![NPM Latest](https://img.shields.io/npm/v/@bitwild/rockets-auth)](https://www.npmjs.com/package/@bitwild/rockets-auth)
[![NPM Downloads](https://img.shields.io/npm/dw/@bitwild/rockets-auth)](https://www.npmjs.com/package/@bitwild/rockets-auth)
[![CI](https://img.shields.io/github/actions/workflow/status/btwld/rockets/ci-merge.yml?branch=main&label=CI)](https://github.com/btwld/rockets/actions/workflows/ci-merge.yml)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![License](https://img.shields.io/npm/l/@bitwild/rockets-auth)](https://github.com/btwld/rockets/blob/main/LICENSE.txt)

> **Self-hosted auth, batteries included.** Signup, login, JWT,
> refresh, password recovery, OTP, invitations, RBAC, admin user CRUD —
> all wired together, every step overrideable.

---

## Table of contents

- [Introduction](#introduction)
- [Tutorial — Your first auth server](#tutorial--your-first-auth-server)
- [How-to guides](#how-to-guides)
- [Reference](#reference)
- [Explanation](#explanation)
- [License](#license)

---

## Introduction

`@bitwild/rockets-auth` ships a complete authentication system for
NestJS. You provide entity classes; Rockets wires the controllers,
handlers, JWT issuance, password hashing, OTP delivery, role-based
access control, invitation workflows, and admin CRUD endpoints around
them.

Every step is exposed through one of seven override seams — port
classes, handler subclasses, per-method hooks, repository
implementations, controller decorators, settings, and notification
ports. You can replace anything without forking.

### When to use this package

| Use this when… | Use a different package when… |
|---|---|
| Rockets owns the user table | Users live in Firebase / Auth0 / external IdP → [`@bitwild/rockets`](../rockets-server/) |
| You want signup / login / OTP / admin out of the box | You want pure infrastructure, no controllers → [`@bitwild/rockets-core`](../rockets-core/) |
| You need RBAC + invitations as part of the auth surface | You're building a custom composition root |

### Why persistence is compiled at the server boundary

Built-in auth still uses a **fixed set of canonical repository keys** inside
the package (`USER_CRUD_ENTITY_KEY`, …). **`defineRocketsAuth`** accepts the
same friendly `persistence.entities` map as before and maps it to
`defineModuleResource` rows for `RocketsModule` / `RocketsCoreModule`, so
auth tables register in the **same planner** as domain `resources[]` without
duplicating `repositoryPersistence` on `RocketsAuthModule`. Historical
discussion: [ADR 0003](../../docs/explanation/adr/0003-auth-persistence-asymmetry.md).

---

## Tutorial — Your first auth server

You'll get a working auth server in ~15 minutes with `/signup`,
`/token/password`, `/token/refresh`, `/me/password`, OTP, RBAC, and
admin user CRUD.

### 1. Install

```bash
yarn add @bitwild/rockets-auth @bitwild/rockets @bitwild/rockets-core \
  @concepta/nestjs-repository-typeorm typeorm @nestjs/typeorm \
  class-transformer class-validator
```

Requires NestJS `^11`, Node `>=18`, TypeScript `>=5`.

### 2. Declare your entity classes

```typescript
// entities/user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ unique: true }) username!: string;
  @Column({ unique: true }) email!: string;
  @Column({ default: true }) active!: boolean;
}

// Similar shape for: UserCredentialEntity, UserMetadataEntity,
// UserOtpEntity, RoleEntity, UserRoleEntity, InvitationEntity.
```

The full set of required entities and their fields is listed in
[`docs/reference/configuration.md`](../../docs/reference/configuration.md).

### 3. Wire `RocketsModule` + `defineRocketsAuth`

`RocketsAuthModule` is loaded **inside** the object returned by
`defineRocketsAuth` (as `nestImports`). You pass that value to
`RocketsModule.forRoot({ auth: … })` together with one root `repository`
adapter and the same `userMetadata` object exposed on the integration (so
`/me` and upstream user metadata stay aligned).

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { RocketsModule } from '@bitwild/rockets';
import { defineRocketsAuth } from '@bitwild/rockets-auth';

import {
  UserEntity, UserCredentialEntity, UserMetadataEntity,
  UserOtpEntity, RoleEntity, UserRoleEntity, InvitationEntity,
} from './entities';
import { UserDto, UserCreateDto, UserUpdateDto } from './dto';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './dto';

const rocketsAuth = defineRocketsAuth({
  persistence: {
    module: TypeOrmRepositoryModule,
    entities: {
      user: UserEntity,
      userCredentials: UserCredentialEntity,
      userMetadata: UserMetadataEntity,
      userOtp: UserOtpEntity,
      role: RoleEntity,
      userRole: UserRoleEntity,
    },
  },
  invitationEntity: InvitationEntity,
  userMetadata: {
    entity: UserMetadataEntity,
    createDto: UserMetadataCreateDto,
    updateDto: UserMetadataUpdateDto,
  },
  useFactory: () => ({
    settings: {
      role: { adminRoleName: 'admin' },
      otp: { assignment: 'auth', category: 'login', type: 'uuid', expiresIn: '1h' },
      email: {
        from: 'noreply@example.com',
        baseUrl: 'http://localhost:3000',
        templates: {
          sendOtp: { fileName: 'otp.hbs', subject: 'Your code' },
          invitation: { fileName: 'inv.hbs', subject: 'Invitation' },
          invitationAccepted: { fileName: 'acc.hbs', subject: 'Welcome' },
        },
      },
    },
    services: { mailerService },
  }),
  userCrud: {
    model: UserDto,
    dto: { createOne: UserCreateDto, updateOne: UserUpdateDto },
  },
});

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [
        UserEntity, UserCredentialEntity, UserMetadataEntity,
        UserOtpEntity, RoleEntity, UserRoleEntity, InvitationEntity,
      ],
      synchronize: true,
    }),
    RocketsModule.forRoot({
      repository: TypeOrmRepositoryModule,
      auth: rocketsAuth,
      userMetadata: rocketsAuth.userMetadata,
      resources: [],
    }),
  ],
})
export class AppModule {}
```

### 4. Run it

```bash
nest start
```

```bash
# Sign up
curl -X POST http://localhost:3000/signup \
  -H "Content-Type: application/json" \
  -d '{ "email": "ada@example.com", "username": "ada", "active": true, "password": "TestP@ss123" }'

# Log in
curl -X POST http://localhost:3000/token/password \
  -H "Content-Type: application/json" \
  -d '{ "username": "ada", "password": "TestP@ss123" }'
# → { "accessToken": "...", "refreshToken": "..." }

# Use the token
TOKEN="<accessToken>"
curl -X PATCH http://localhost:3000/me/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "currentPassword": "TestP@ss123", "newPassword": "NewP@ssw0rd" }'
```

Working end-to-end app with all features wired (RBAC, invitations,
metadata): [`examples/sample-server-auth/`](../../examples/sample-server-auth/).

---

## How-to guides

### How to override one step of a handler (e.g. log every signup)

```typescript
import { Injectable } from '@nestjs/common';
import { AbstractSignupUserHandler } from '@bitwild/rockets-auth';

@Injectable()
class AuditedSignupHandler extends AbstractSignupUserHandler {
  protected async afterSave(ctx, agg) {
    await this.auditLog.write({ userId: agg.id, action: 'signup' });
  }
}

RocketsAuthModule.forRoot({
  // ...
  user: {
    extras: {
      providers: [
        { provide: SignupUserHandler, useClass: AuditedSignupHandler },
      ],
    },
  },
});
```

The `Abstract*Handler` pattern exposes 8 protected methods per
use-case (validate / load / mutate / persist / notify, etc.). Override
only the step you care about.

### How to append decorators to a built-in route (e.g. throttling)

```typescript
RocketsAuthModule.forRoot({
  // ...
  invitation: {
    controllers: {
      acceptance: {
        routes: {
          accept: {
            decorators: [Throttle({ default: { limit: 3, ttl: 60_000 } })],
          },
        },
      },
    },
  },
});
```

The decorators are applied **after** the built-in ones, so you can layer
guards, ACL rules, throttling, OpenAPI tags, etc.

### How to disable a built-in controller

```typescript
RocketsAuthModule.forRoot({
  // ...
  disableController: {
    otp: true,                 // turn off /otp
    invitation: true,          // turn off all /admin/invitations + acceptance
  },
});
```

### How to invite a user

```bash
# Admin creates an invitation
curl -X POST http://localhost:3000/admin/invitations \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{ "email": "newbie@example.com", "category": "user-invite" }'

# User accepts via emailed code
curl -X PATCH http://localhost:3000/invitation-acceptance/<CODE> \
  -d '{ "passcode": "<...>", "newPassword": "P@ss123" }'
```

Full flow with email templates: [`docs/how-to/auth/invite-user.md`](../../docs/how-to/auth/invite-user.md).

### How to add an ACL rule

```typescript
import { ACServiceInterface } from '@concepta/nestjs-access-control';

@Injectable()
export class AppACService implements ACServiceInterface {
  acRules() {
    return [
      { role: 'admin',  resource: 'user',  action: ['read', 'create', 'update', 'delete'], possession: 'any' },
      { role: 'user',   resource: 'user',  action: ['read', 'update'], possession: 'own' },
    ];
  }
}
```

Wire `AppACService` via `accessControl.queryServices` in
`RocketsAuthModule.forRoot`. Full guide:
[`docs/how-to/access-control/add-an-acl-rule.md`](../../docs/how-to/access-control/add-an-acl-rule.md).

### How to add an app-level resource alongside auth

`RocketsAuthModule` owns the auth entities. For app-level entities,
add a parallel `RocketsModule.forRootAsync(...)` (or
`RocketsCoreModule`) and register them via `defineResource()` /
`defineModuleResource()`:

```typescript
@Module({
  imports: [
    TypeOrmModule.forRoot({ /* includes PetEntity */ }),

    RocketsAuthModule.forRootAsync({ /* auth wiring */ }),

    // Add app resources on top, sharing the same JWT auth.
    RocketsModule.forRootAsync({
      inject: [RocketsJwtAuthAdapter],   // exported by RocketsAuthModule
      useFactory: (auth) => ({ authProvider: auth }),
      // repository omitted — auth module already registered persistence
      resources: [petResource],
    }),
  ],
})
export class AppModule {}
```

### How to issue your own JWT instead of using the built-in flow

If you want to keep the auth surface but issue tokens differently,
override the relevant handler:

```typescript
import { AbstractIssueAuthTokensHandler } from '@bitwild/rockets-auth';

@Injectable()
class CustomTokenIssuer extends AbstractIssueAuthTokensHandler {
  protected async issue(ctx, user) {
    // Your token issuance logic. Return { accessToken, refreshToken }.
  }
}
```

Then plug `useClass: CustomTokenIssuer` into the appropriate domain's
`extras.providers`. Reference: [`docs/reference/handler-seams.md`](../../docs/reference/handler-seams.md).

---

## Reference

### Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/signup` | Register a new user | public |
| `POST` | `/token/password` | Issue access + refresh tokens | public |
| `POST` | `/token/refresh` | Refresh access token | public |
| `POST` | `/auth/recovery/login` | Request username recovery email | public |
| `POST` | `/auth/recovery/password` | Request password recovery email | public |
| `PATCH` | `/auth/recovery/password` | Reset password with passcode | public |
| `PATCH` | `/me/password` | Change own password | required |
| `POST` | `/otp` | Send OTP via email | public |
| `PATCH` | `/otp` | Confirm OTP, issue tokens | public |
| `POST` | `/admin/invitations` | Create + send invitation | admin |
| `PATCH` | `/invitation-acceptance/:code` | Accept invitation with passcode | public |
| `POST` | `/admin/invitations/revoke` | Revoke pending invitations | admin |
| `POST` | `/admin/invitations/:code/reattempt` | Re-send invitation email | admin |
| `*` | `/admin/users` | Admin user CRUD | admin |
| `*` | `/admin/roles` | Admin role CRUD | admin |
| `GET` | `/admin/users/:userId/roles` | List user's roles | admin |
| `POST` | `/admin/users/:userId/roles` | Assign role | admin |

OAuth (`/oauth/*`) is currently parked — see
[`docs/explanation/upstream-gaps.md`](../../docs/explanation/upstream-gaps.md).

### `defineRocketsAuth(input)`

Returns a **`RocketsAuthIntegration`** for `RocketsModule.forRoot({ auth })`.
Required input fields include **`persistence`**, **`userMetadata`**, and
**`userCrud`**; all other keys match `RocketsAuthModule.forRootAsync` async
options (`useFactory`, `inject`, `imports`, `roleCrud`, `accessControl`, …).

### `RocketsAuthModule.forRoot(options) / forRootAsync(asyncOptions)`

| Field | Type | Required | Description |
|---|---|---|---|
| *(persistence)* | — | — | **Not on the module.** Supply `persistence` on `defineRocketsAuth` when composing with `RocketsModule`. |
| `settings` | `{ role, otp, email, ... }` | optional | Tunable defaults per domain. |
| `services` | `{ mailerService }` | optional (✅ if email used) | Mailer service for OTP and invitations. |
| `disableController` | `DisableControllerOptionsInterface` | optional | Turn off built-in controllers (`otp`, `signup`, `admin`, …). |
| `auth.imports` / `auth.controller` | various | optional | Per-domain extras for `/me/password`. |
| `otp.imports` / `otp.controller` | various | optional | Extras for `/otp`. |
| `invitation.imports` / `invitation.controllers` | various | optional | Per-controller extras for invitations. |
| `role.*` | various | optional | Forwarded to `RoleModule`. |
| `userCrud` | `UserCrudOptionsExtrasInterface` | optional | Admin user CRUD DTOs + handler overrides. |
| `roleCrud` | `RoleCrudOptionsExtrasInterface` | optional | Admin role CRUD config. |
| `accessControl` | `AccessControlOptionsInterface & { imports?, queryServices? }` | optional | RBAC rules + ACL services. |
| `ports` | `RocketsAuthPortsConfigInterface` | optional | Override port-default handlers. |
| `global` | `boolean` | default `false` | Make module global. |

### `RocketsAuthRepositoryPersistenceOptions` (`defineRocketsAuth({ persistence })`)

```typescript
{
  module: Type;              // e.g. TypeOrmRepositoryModule
  entities: {
    user: Type;              // required
    userCredentials: Type;   // required
    userMetadata?: Type;     // recommended
    userOtp?: Type;          // required if OTP enabled
    role?: Type;             // required if role module used
    userRole?: Type;         // required for role assignments
    federatedIdentity?: Type;// required if OAuth enabled
  };
}
```

### Override seams

Every domain is overrideable through one of seven seams:

| Seam | Where | What it overrides |
|---|---|---|
| Port class | `RocketsAuthPortsModule.forRoot({ ports })` | Cross-domain access (user, otp). |
| Handler subclass | Provide `useClass` for any default `*Handler` | Whole use-case. |
| Per-method hook | Override one `protected` method on `Abstract*Handler` | Single step (validate / persist / notify). |
| Repository implementation | Custom repo class via DI | Persistence per entity. |
| Controller extras | `extras.<domain>.controller.{classDecorators, useHooks, routes[*].decorators, routes[*].handler}` | Guards, ACL, throttling, ApiTags, RepoHooks per controller. |
| Settings | `forRoot({ <domain>: { settings: ... } })` | Tunables (expiresIn, namespaces). |
| Notification port | `extras.ports.invitationNotification` | Email templates / channels. |

Full reference: [`docs/reference/handler-seams.md`](../../docs/reference/handler-seams.md)

- [`docs/reference/controller-extras.md`](../../docs/reference/controller-extras.md).

### Generated Swagger

Live source of truth for the API: [`SWAGGER.md`](./SWAGGER.md) (generated from
`swagger/swagger.json`).

---

## Explanation

### Architecture (DDD per domain)

```textdomains/
├── auth/          # /me/password (other auth routes are upstream now)
├── role/          # admin/roles, admin/users/:id/roles
├── otp/           # /otp send + confirm
├── invitation/    # admin/invitations + acceptance
├── oauth/         # parked — upstream blockers
└── user/          # admin/users, /signup, user metadata, default reference impl
```

Each domain follows the canonical layout:

```text<domain>/
├── domain/                    # zero framework imports
├── application/               # CQRS commands / queries / listeners
├── infrastructure/            # DTOs, persistence, services, config
├── gateways/http/factories/   # build*Controller(extras) factories
├── interfaces/                # public contracts + extras shapes
└── modules/                   # forRoot/forRootAsync wiring (when needed)
```

See [`DDD_REFERENCE.md`](./DDD_REFERENCE.md) for the canonical pattern.

### Persistence and `defineRocketsAuth`

The auth stack still injects repositories by **canonical keys** defined in
this package. **`defineRocketsAuth`** is the supported composition helper: it
maps the friendly `persistence.entities` object to those keys when building
`defineModuleResource` rows, so app code never imports
`USER_CRUD_ENTITY_KEY` et al. At runtime, `RocketsAuthModule` is nested under
`RocketsModule` after `RocketsCoreModule` has registered the planner rows.

Background: [ADR 0003](../../docs/explanation/adr/0003-auth-persistence-asymmetry.md).

### Layering

```text
rockets-core           framework primitives (auth abstraction, CQRS, declarative resources)
    ▲
rockets-server         /me + AuthServerGuard for external auth integrations
    ▲
rockets-server-auth    ◀── THIS PACKAGE
                        wires upstream @concepta/nestjs-* v8 packages
                        (user, password, otp, role, federated, …) into one
                        coherent JWT auth surface with declarative
                        per-controller extras
```

### Related documentation

- **Tutorial — first auth server:** [`docs/tutorials/01-first-auth-server.md`](../../docs/tutorials/01-first-auth-server.md)
- **Tutorial — override a handler:** [`docs/tutorials/04-override-a-handler.md`](../../docs/tutorials/04-override-a-handler.md)
- **Reference — full config:** [`docs/reference/configuration.md`](../../docs/reference/configuration.md)
- **Reference — handler seams:** [`docs/reference/handler-seams.md`](../../docs/reference/handler-seams.md)
- **Reference — controller extras:** [`docs/reference/controller-extras.md`](../../docs/reference/controller-extras.md)
- **Reference — port services:** [`docs/reference/port-services.md`](../../docs/reference/port-services.md)
- **Reference — exceptions catalogue:** [`docs/reference/exceptions.md`](../../docs/reference/exceptions.md)
- **How-to — invite a user:** [`docs/how-to/auth/invite-user.md`](../../docs/how-to/auth/invite-user.md)
- **How-to — add an ACL rule:** [`docs/how-to/access-control/add-an-acl-rule.md`](../../docs/how-to/access-control/add-an-acl-rule.md)
- **Explanation — DDD architecture:** [`docs/explanation/ddd-clean-arch.md`](../../docs/explanation/ddd-clean-arch.md)
- **Explanation — 7 override seams:** [`docs/explanation/7-override-seams.md`](../../docs/explanation/7-override-seams.md)
- **Internal — DDD reference for contributors:** [`DDD_REFERENCE.md`](./DDD_REFERENCE.md)
- **Generated Swagger:** [`SWAGGER.md`](./SWAGGER.md)

### Related packages

- [`@bitwild/rockets-core`](../rockets-core/) — infrastructure only
- [`@bitwild/rockets`](../rockets-server/) — external auth integration
- Upstream `@concepta/nestjs-*` v8 — building blocks. Version matrix: [`docs/reference/upstream-versions.md`](../../docs/reference/upstream-versions.md)

---

## License

MIT — see [`../../LICENSE.txt`](../../LICENSE.txt).