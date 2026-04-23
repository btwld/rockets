<!-- markdownlint-disable MD013 -->
# Rockets Core

[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Shared server infrastructure for the Rockets ecosystem. Provides auth
abstraction, CQRS wiring, declarative resources, repository registration, and
Swagger setup — everything `@bitwild/rockets` (external auth integration) and
`@bitwild/rockets-server-auth` (full auth system) build on top of.

## What this package provides

- **`AuthProviderInterface`** — the contract consumers implement to plug in any
  authentication system (JWT, Firebase, Auth0, custom).
- **`AuthServerGuard`** — global guard that reads `Authorization: Bearer <token>`
  and calls `AuthProviderInterface.validateToken()`.
- **`@AuthPublic()`** decorator — opt-out of the global guard per route.
- **`AuthorizedUserOverlay`** — request-scoped context overlay that surfaces the
  authorized user to CRUD handlers without parameter drilling.
- **Declarative resources** — `defineResource()` + `aggregateResources()`:
  generate CRUD controllers from an entity + DTOs, with persistence and
  relations wiring.
- **Unified `repositories` config** — one field declares `userMetadata` +
  additional entities, grouped by persistence adapter.
- **CQRS handlers** — default `UpsertUserMetadataHandler` and
  `GetUserMetadataHandler` (overridable).
- **Swagger UI module** — registered here so both `rockets` and `rockets-auth`
  get API docs from a single config.

## What this package does NOT provide

- No controllers (core has no presentation layer).
- No login, signup, OAuth, OTP endpoints — those live in `rockets-server-auth`.
- No `/me` endpoint — that lives in `rockets`.

## Installation

```bash
yarn add @bitwild/rockets-core
```

## Quick use

Most consumers use `rockets-core` indirectly via `@bitwild/rockets` or
`@bitwild/rockets-server-auth`. Use it directly when you need the minimum
infrastructure without the `/me` endpoint or global-guard opinions.

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { RocketsCoreModule, defineResource } from '@bitwild/rockets-core';
import { UserMetadataEntity, PetEntity } from './entities';
import { MyAuthProvider } from './auth';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [UserMetadataEntity, PetEntity],
      synchronize: true,
    }),
    RocketsCoreModule.forRoot({
      authProvider: new MyAuthProvider(),
      repositories: {
        module: TypeOrmRepositoryModule,
        userMetadata: { entity: UserMetadataEntity },
      },
      resources: [
        defineResource({
          key: 'pet',
          entity: PetEntity,
          path: 'pets',
          tags: ['Pets'],
        }),
      ],
    }),
  ],
})
export class AppModule {}
```

## Configuration reference

### `RocketsCoreModule.forRoot(options)`

```typescript
interface RocketsCoreOptionsInterface {
  authProvider: AuthProviderInterface;
  settings?: RocketsCoreSettingsInterface;
  swagger?: SwaggerUiOptionsInterface;
}
```

### Extras (static, build-time)

```typescript
interface RocketsCoreOptionsExtrasInterface {
  global?: boolean;                         // Default: true
  repositories?: RocketsRepositoriesConfig; // userMetadata + entities + module
  resources?: RocketsResourceInput[];        // bundles or raw configs
  providers?: Provider[];
  handlers?: {
    upsertUserMetadata?: Type<AbstractUpsertUserMetadataHandler>;
    getUserMetadata?: Type<AbstractGetUserMetadataHandler>;
  };
}
```

### `repositories` (unified persistence)

```typescript
{
  module: TypeOrmRepositoryModule,           // default adapter
  userMetadata: { entity: UserMetadataEntity },
  entities: [                                 // additional standalone entities
    { key: 'user', entity: UserEntity },
    { key: 'audit', entity: AuditEntity, module: FirestoreModule }, // override
  ],
}
```

## Architecture

```
rockets-common        shared utils, zero framework opinion
rockets-repository    abstract data access (no TypeORM, no Firestore)
rockets-crud          generic CRUD
rockets-access-control ACL/RBAC
    ▲
rockets-core          ◀── THIS PACKAGE
  • auth abstraction (AuthProviderInterface, AuthServerGuard)
  • CQRS handlers (userMetadata)
  • declarative resources (defineResource, aggregateResources)
  • repositories config (flattenRepositories)
  • Swagger UI registration
    ▲
rockets (server)      composition root for external auth integration
rockets-server-auth   full auth system (JWT, signup, login, OAuth, OTP)
```

See [`development-guides/ROCKETS_PACKAGES_GUIDE.md`](../../development-guides/ROCKETS_PACKAGES_GUIDE.md)
for package selection guidance.
