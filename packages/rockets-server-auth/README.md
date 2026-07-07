# @bitwild/rockets-auth

[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Complete built-in auth system for Rockets: signup, login, password recovery,
> OTP, invitations, roles, admin user CRUD — wired as a single
> `defineRocketsAuth()` integration.

**Status:** alpha (`1.0.0-alpha.9`, published on npm as
`@bitwild/rockets-auth@alpha`). API on the `defineRocketsAuth()` surface is
stable; the OAuth submodule is parked pending upstream v8 ports (see
[Known limitations](#known-limitations)).

---

## 1. Introduction

`@bitwild/rockets-auth` is what you reach for when your application owns its
users. It is the alternative to `@bitwild/rockets` for the case where you do
**not** delegate authentication to an external IdP.

It composes the v8 line of `@concepta/nestjs-*` **identity motors** (`user`,
`password`, `otp`, `role`, `invitation`, `federated`, `email`, `event`, plus
`authentication`) into a single configuration shape and exposes them as an
`AuthBootstrap` for `RocketsModule.forRoot({ auth: ... })` from
`@bitwild/rockets`. It does **not** replace repository/CRUD/hook motors — those
still come from core + `@bitwild/rockets-common`.

### What it gives you

- **HTTP routes** (mounted by the bundle):
  - `POST /token/password` — login. `POST /token/refresh` — refresh.
  - `PATCH /me` (password change) and the rest of `/me` from `@bitwild/rockets`.
  - `POST /otp`, `PATCH /otp` — OTP issue / verify.
  - `POST /signup` — user signup (wired through `userCrud`).
  - Admin: `/admin/users`, `/admin/users/:userId/roles`, `/admin/invitations` (+
    accept / revoke / reattempt).
  - `/invitation-acceptance` for invited users.
- **Provider**: `RocketsJwtAuthAdapter` — Rockets-spec `AuthAdapterInterface`
  that validates the JWT issued by `/token/password` and produces an
  `AuthorizedUser` with `userRoles`.
- **Access control** re-exports from `@concepta/nestjs-access-control` so app
  code single-sources from this package.
- **Customisation seams**: per-controller decorator extras
  (`controller.classDecorators`, `controller.routes[*].decorators`), abstract
  handler classes for every admin operation, port overrides for every
  cross-module command/query.

### When to use this package

- You want a complete user system out of the box (signup, login, OTP, password
  recovery, roles, invitations, admin endpoints) and you don't want to glue
  seven modules together yourself.
- You will deploy in environments where the application owns the identity store.

### When NOT to use this package

- Users live in an external IdP (Firebase, Auth0, Okta, custom JWT) → use
  `@bitwild/rockets` + the matching adapter.
- You only need login + a custom user table without OTP / invitations / admin →
  drop to `@bitwild/rockets` and write a small JWT adapter yourself.

---

## 2. Get Started

### Install

```bash
yarn add @bitwild/rockets-auth@alpha @bitwild/rockets@alpha @bitwild/rockets-core@alpha \
  @bitwild/rockets-common@alpha \
  @nestjs/common @nestjs/core @nestjs/cqrs @nestjs/swagger @nestjs/jwt @nestjs/passport \
  class-transformer class-validator reflect-metadata rxjs
```

Bring the upstream `@concepta/nestjs-*` packages and a repository adapter your
app supports (e.g. `@concepta/nestjs-repository-typeorm` + `typeorm`).

### Minimal working example

```typescript
import { Module } from '@nestjs/common';
import { EventModule } from '@concepta/nestjs-event';
import { RocketsModule } from '@bitwild/rockets';
import {
  defineRocketsAuth,
  buildRocketsAuthResources,
} from '@bitwild/rockets-auth';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';

import {
  UserEntity,
  UserCredentialEntity,
  UserOtpEntity,
  RoleEntity,
  UserRoleEntity,
  FederatedEntity,
  InvitationEntity,
  UserDto,
  UserCreateDto,
  SampleUserUpdateDto,
} from './user';
import {
  UserMetadataEntity,
  UserMetadataCreateDto,
  UserMetadataUpdateDto,
} from './user/metadata';
import { RoleDto, RoleCreateDto, RoleUpdateDto } from './role';

// One bootstrap instance — same reference on `repository` and `persistence.module`.
const repo = defineTypeOrmRepository({
  type: 'sqlite',
  database: ':memory:',
  synchronize: true,
  dropSchema: true,
});

const rocketsAuthInput = {
  persistence: {
    module: repo,
    entities: {
      user: UserEntity,
      userCredentials: UserCredentialEntity,
      userOtp: UserOtpEntity,
      role: RoleEntity,
      userRole: UserRoleEntity,
      federatedIdentity: FederatedEntity,
    },
  },
  invitationEntity: InvitationEntity,
  userMetadata: {
    entity: UserMetadataEntity,
    createDto: UserMetadataCreateDto,
    updateDto: UserMetadataUpdateDto,
  },
  userCrud: {
    model: UserDto,
    dto: { createOne: UserCreateDto, updateOne: SampleUserUpdateDto },
  },
  roleCrud: {
    model: RoleDto,
    dto: { createOne: RoleCreateDto, updateOne: RoleUpdateDto },
  },
  useFactory: () => ({
    services: {
      mailerService: {
        sendMail: async (opts) => {
          /* wire your real SMTP / SES adapter */
        },
      },
    },
    authentication: {
      ports: {
        recoveryNotification: {
          sendRecoverLoginNotificationCommand: SendRecoverLoginCmd,
          sendRecoverPasswordNotificationCommand: SendRecoverPasswordCmd,
          sendPasswordUpdatedNotificationCommand: SendPasswordUpdatedCmd,
        },
        verifyNotification: {
          sendVerifyNotificationCommand: SendVerifyCmd,
        },
      },
    },
    settings: {
      role: { adminRoleName: 'admin', defaultUserRoleName: 'user' },
      email: {
        from: 'noreply@example.com',
        baseUrl: 'http://localhost:3000',
        templates: {
          /* ... */
        },
      },
      otp: {
        assignment: 'userOtp' as const,
        category: 'auth-login',
        type: 'uuid' as const,
        expiresIn: '1h',
      },
    },
  }),
};

const rocketsAuth = defineRocketsAuth(rocketsAuthInput);
const rocketsAuthResources = buildRocketsAuthResources(
  rocketsAuthInput.persistence,
  rocketsAuthInput.invitationEntity,
);

@Module({
  imports: [
    EventModule.forRoot({}),
    RocketsModule.forRoot({
      auth: rocketsAuth,
      repository: repo,
      resources: [...rocketsAuthResources /* your defineResource bundles */],
    }),
  ],
})
export class AppModule {}
```

`defineTypeOrmRepository` is the same app-local `RepositoryBootstrap` helper
used with `@bitwild/rockets` (wrap `TypeOrmModule.forRoot` +
`TypeOrmRepositoryModule.forFeature`). Run `yarn sample-auth:dev` from the
monorepo root for a full working app.

---

## 3. How-to Guides

### Reuse the user's roles inside Access Control

`AccessControlServiceInterface` lives in `@bitwild/rockets-auth` (re-exported).
Implement `getUserRoles` by reading `userRoles` off the request —
`RocketsJwtAuthAdapter` populates that shape from the user-role join
automatically.

```typescript
import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessControlServiceInterface } from '@bitwild/rockets-auth';

@Injectable()
export class ACService implements AccessControlServiceInterface {
  async getUser<T>(ctx: ExecutionContext): Promise<T> {
    return ctx.switchToHttp().getRequest().user as T;
  }

  async getUserRoles(ctx: ExecutionContext): Promise<string[]> {
    const user = await this.getUser<{
      userRoles?: { role: { name: string } }[];
    }>(ctx);
    if (!user) throw new UnauthorizedException();
    return user.userRoles?.map((ur) => ur.role.name) ?? [];
  }
}
```

Pass it to `accessControl.service` inside `defineRocketsAuth({ ... })`.

### Override a single admin handler (e.g. custom signup logic)

Each admin operation has an abstract base class. Extend, then point the override
slot at it.

```typescript
import {
  AbstractSignupUserHandler,
  SignupUserCommand,
} from '@bitwild/rockets-auth';

@CommandHandler(SignupUserCommand)
export class SignupWithReferralHandler extends AbstractSignupUserHandler {
  async execute(cmd: SignupUserCommand) {
    const user = await super.execute(cmd);
    await this.referralService.attach(user.id, cmd.referralCode);
    return user;
  }
}

defineRocketsAuth({
  // ...
  userCrud: {
    model: UserDto,
    dto: { createOne: UserCreateDto, updateOne: SampleUserUpdateDto },
    handlers: { signupHandler: SignupWithReferralHandler },
  },
});
```

Available slots: `signupHandler`, `adminList`, `adminRead`, `adminUpdate`,
`adminDelete` (all under `userCrud.handlers`).

### Disable specific controllers

When you ship your own variant, opt the built-in out via
`extras.disableController`:

```typescript
RocketsModule.forRoot({
  auth: rocketsAuth,
  disableController: { admin: true, invitation: true },
});
```

Available flags: `otp`, `signup`, `admin`, `adminRoles`, `invitation`,
`invitationAcceptance`, `invitationRevocation`, `invitationReattempt`,
`mePassword`, `token`. (The `disableController` field on
`RocketsAuthModule.forRootAsync` directly accepts the same shape;
`defineRocketsAuth` propagates it.)

### Skip the global guard

By default, `RocketsModule` opts in `AuthServerGuard` as `APP_GUARD`. To leave
the guard wholly to the upstream `@concepta/nestjs-authentication` (recommended
when you use this package's full stack):

```typescript
defineRocketsAuth({
  // ...
  rocketsDefaults: { enableGlobalGuard: false },
});
```

The upstream `AuthenticationModule` registers its own `APP_GUARD` (`JwtGuard`).
Forward extras through `extras.auth.appGuard: false` if you want zero global
guard.

### Customise a controller without subclassing

Every factory-built controller accepts a `controller.classDecorators` array and
a `controller.routes[*].decorators` map. Use them to attach throttling, ACL
decorators, or rate limits.

```typescript
defineRocketsAuth({
  // ...
  otp: {
    controller: {
      routes: {
        issue: { decorators: [Throttle({ default: { limit: 3, ttl: 60 } })] },
        verify: { decorators: [Throttle({ default: { limit: 10, ttl: 60 } })] },
      },
    },
  },
});
```

The same pattern applies to `extras.auth.controller` (for `/me/password`),
`extras.invitation.controllers.*`, and `extras.role.controller` (admin role
mgmt).

---

## 4. Reference

### Upstream engine (identity motors)

| `@concepta/nestjs-*` motor | Role in `defineRocketsAuth`                          |
| -------------------------- | ---------------------------------------------------- |
| `user`                     | User CRUD, signup, admin users                       |
| `password`                 | Login, refresh, password change, recovery            |
| `otp`                      | OTP issue / verify                                   |
| `role`                     | Role admin CRUD                                      |
| `invitation`               | Invitations + acceptance                             |
| `federated`                | Federated identity rows                              |
| `email` / `event`          | Mailer hooks, domain events                          |
| `authentication`           | Shared auth types/utilities                          |
| `access-control`           | RBAC (re-exported from this package for convenience) |

**Shared stack (path A and B):** repository + CRUD + hooks still run through
`@bitwild/rockets-core` and the same `repository` / `resources[]` options on
`RocketsModule.forRoot`.

**This package does not depend on `@bitwild/rockets`** — your app imports both
when you need built-in auth HTTP and `/me`.

### Entry points

| Symbol                                                         | Purpose                                                                                                                                                                                                            |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `defineRocketsAuth(input)`                                     | Returns an `AuthBootstrap` for `RocketsModule.forRoot({ auth })`. Pair with `buildRocketsAuthResources()` on `resources` for auth persistence rows; `RocketsAuthModule` mounts via the bootstrap's adapter wiring. |
| `buildRocketsAuthResources(persistence, invitationEntity?)`    | Converts auth `persistence` config into `defineModuleResource` rows for `resources[]`.                                                                                                                             |
| `RocketsAuthModule.forRoot(options)` / `forRootAsync(options)` | Direct registration. Use only when you need to mount the auth module outside the `RocketsModule` composition.                                                                                                      |
| `RocketsJwtAuthAdapter`                                        | The default JWT adapter validated by the chain. Picked by `defineRocketsAuth` unless `authAdapter` is overridden.                                                                                                  |

### `defineRocketsAuth` input

| Field                               | Type                                                                         | Required | Purpose                                                                                                                                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `persistence.module`                | `RepositoryModuleInterface`                                                  | yes      | Same adapter instance as `RocketsModule.forRoot({ repository })` — typically a `defineTypeOrmRepository(...)` bootstrap, not raw `TypeOrmRepositoryModule` alone.                                          |
| `persistence.entities`              | `{ user, userCredentials?, userOtp?, role?, userRole?, federatedIdentity? }` | yes      | Entity classes for the auth tables. Provide what you use.                                                                                                                                                  |
| `invitationEntity`                  | `Type`                                                                       | optional | Adds an `invitation` repository row + enables invitation routes.                                                                                                                                           |
| `userMetadata`                      | `RocketsUserMetadataConfig`                                                  | yes      | Forwarded to `/me`; also used as the default `userCrud.userMetadataConfig`.                                                                                                                                |
| `userCrud`                          | `UserCrudOptionsExtrasInterface`                                             | yes      | `model`, `dto.createOne` / `updateOne`, `handlers`, controller extras.                                                                                                                                     |
| `roleCrud`                          | `RoleCrudOptionsExtrasInterface`                                             | optional | Same shape, for the role admin routes.                                                                                                                                                                     |
| `authAdapter`                       | `Type<AuthAdapterInterface>`                                                 | optional | Override the JWT adapter (e.g. inject a custom claim transformer).                                                                                                                                         |
| `rocketsDefaults.enableGlobalGuard` | `boolean`                                                                    | optional | Hint to `RocketsModule` about the global guard default.                                                                                                                                                    |
| All other fields                    | inherited from `RocketsAuthOptionsInterface`                                 | optional | `useFactory` / `useExisting`, plus `settings`, `authentication`, `user`, `password`, `otp`, `email`, `crud`, `role`, `invitation`, `federated`, `services`, `accessControl`, `disableController`, `ports`. |

### `RocketsAuthModule.forRoot(options)` — top-level options

| Field                                                                         | Purpose                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings`                                                                    | Rockets-specific settings (role names, OTP defaults, email templates).                                                                                                     |
| `authentication`                                                              | Forwarded to `@concepta/nestjs-authentication`. Includes `settings.{jwt, strategies, mfa, guards}` and `ports.*`. Notification ports must be supplied (no silent default). |
| `user`, `password`, `otp`, `email`, `crud`, `role`, `federated`, `invitation` | Per-module config blocks, forwarded as-is to upstream modules.                                                                                                             |
| `services.mailerService`                                                      | Required mailer adapter. Use a logger fallback for dev.                                                                                                                    |
| `services.userAccessQueryService`                                             | Optional `CanAccess` for access-control queries.                                                                                                                           |
| `swagger`                                                                     | Forwarded to `SwaggerUiModule`.                                                                                                                                            |

### Module-level extras

| Field                                                                                 | Purpose                                                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accessControl`                                                                       | `AccessControlOptionsInterface` + `imports` + `queryServices` — enables the global ACL guard wiring.                                                                            |
| `disableController`                                                                   | Drop built-in controllers (`otp`, `signup`, `admin`, `adminRoles`, `invitation`, `invitationAcceptance`, `invitationRevocation`, `invitationReattempt`, `mePassword`, `token`). |
| `ports`                                                                               | `RocketsAuthPortsConfigInterface` — per-handler overrides for cross-module Command/Query plumbing.                                                                              |
| `auth.appGuard`                                                                       | Override the global `APP_GUARD` from `AuthenticationModule`.                                                                                                                    |
| `auth.controller` / `otp.controller` / `invitation.controllers.*` / `role.controller` | Per-controller decorator extras (`classDecorators`, `routes[*].decorators`).                                                                                                    |

### Domain re-exports

Every public type and CQRS class from the auth, user, otp, role, and invitation
domains is re-exported under the package root:

- **Auth**: `SignupUserCommand`, `AbstractSignupUserHandler`,
  `MePasswordController` factory, `RocketsAuthTokenController`,
  `RocketsJwtAuthAdapter`.
- **User**: `AbstractAdminUserListHandler`, `AbstractAdminUserReadHandler`,
  `AbstractAdminUserUpdateHandler`, `AbstractAdminDeleteUserHandler`,
  `RocketsAuthUserInterface`, `RocketsAuthUserMetadata*Interface`.
- **Role**: `RocketsAuthRoleInterface`, role CRUD entities and DTOs.
- **OTP**: `OtpModule` re-export, OTP controllers and extras.
- **Invitation**: invitation entities, DTOs, controllers, and the four
  factory-built controllers (`invitation`, `acceptance`, `revocation`,
  `reattempt`).

### Access-control re-exports

Saved here so consumers don't dual-import from
`@concepta/nestjs-access-control`:

`AccessControlModule`, `AccessControlGuard`, `AccessControlFilter`,
`AccessControlContext`, `AccessControlService`, every
`@AccessControl{Create,Read,Update,Replace,Delete,Recover}*` decorator,
`@AccessControlGrant`, `@AccessControlQuery`, `ActionEnum`, `PossessionEnum`,
`AccessControlAction`, `CanAccess`, `AccessControlOptionsInterface`,
`AccessControlContextInterface`.

### Known limitations

- **OAuth providers (Apple, Google, GitHub)** are deferred — upstream
  `@concepta/nestjs-auth-{apple,google,github,router}` have not been ported to
  v8. The folder `src/domains/oauth/` is parked with the v7 wiring preserved as
  a comment and `TODO(upstream:)` markers. `extras.auth.guards` exists for
  forward-compat plumbing but routes resolve only after the upstream ports ship.
- **Email module** is on v7 (`@concepta/nestjs-email@7.0.0-alpha.10`) and
  `@concepta/nestjs-access-control@7.0.0-alpha.10` — the cross-version mix is
  intentional while the v8 port is in flight. No code change required when those
  land.

Dump OpenAPI from a running auth app: `yarn generate-swagger` at the monorepo
root (uses the `rockets-auth-swagger` CLI bin).

---

## License

BSD-3-Clause
