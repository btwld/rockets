<!-- markdownlint-disable MD013 -->
# Rockets Server

## Project

[![NPM Latest](https://img.shields.io/npm/v/@bitwild/rockets)](https://www.npmjs.com/package/@bitwild/rockets)
[![NPM Downloads](https://img.shields.io/npm/dw/@bitwild/rockets)](https://www.npmjs.com/package/@bitwild/rockets)
[![CI](https://img.shields.io/github/actions/workflow/status/btwld/rockets/ci-merge.yml?branch=main&label=CI)](https://github.com/btwld/rockets/actions/workflows/ci-merge.yml)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/npm/l/@bitwild/rockets)](https://github.com/btwld/rockets/blob/main/LICENSE.txt)

## Table of Contents

- [Introduction](#introduction)
  - [When to use this package](#when-to-use-this-package)
  - [When NOT to use this package](#when-not-to-use-this-package)
  - [Installation](#installation)
- [Tutorial](#tutorial)
  - [Basic Setup](#basic-setup)
  - [Testing the Setup](#testing-the-setup)
- [Configuration](#configuration)
  - [Auth Provider](#auth-provider)
  - [User Metadata](#user-metadata)
  - [Repositories](#repositories)
  - [Resources](#resources)
- [API Reference](#api-reference)
  - [Endpoints](#endpoints)
  - [Decorators](#decorators)

---

## Introduction

**Rockets Server** is the composition layer for the Rockets ecosystem focused on
**integrating external authentication systems**. You bring your own auth
(Firebase, Auth0, Cognito, your company's JWT, anything) by implementing
`AuthProviderInterface`, and Rockets Server wires up:

- A global `AuthServerGuard` that validates every request against your provider
- A `/me` endpoint that combines your external user with local metadata
- Swagger UI for API documentation (via `rockets-core`)
- Declarative CRUD resources (via `rockets-core`)

### When to use this package

- Your users live in an external system (Firebase, Auth0, another service).
- You want a thin layer that validates tokens and stores local user metadata.
- You want to build CRUD endpoints protected by that external auth.

### When NOT to use this package

- You need signup, login, password recovery, OAuth, OTP, or admin user CRUD.
  → Use **[@bitwild/rockets-server-auth](https://www.npmjs.com/package/@bitwild/rockets-server-auth)**.
- You don't want a `/me` endpoint or a global guard.
  → Use **[@bitwild/rockets-core](../rockets-core)** directly.

### Installation

**Version Requirements**:

- NestJS: `^11.0.0`
- Node.js: `>=18.0.0`
- TypeScript: `>=5.0.0`

```bash
yarn add @bitwild/rockets @bitwild/rockets-core \
  @concepta/nestjs-repository-typeorm typeorm @nestjs/typeorm \
  class-transformer class-validator
```

---

## Tutorial

### Basic Setup

#### Step 1: Create a UserMetadata entity

Stores local data (profile fields, preferences) for each external user:

```typescript
// entities/user-metadata.entity.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_metadata')
export class UserMetadataEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;  // id of the user in the external system

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dateCreated!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  dateUpdated!: Date;
}
```

#### Step 2: Create DTOs

```typescript
// dto/user-metadata.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UserMetadataCreateDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() lastName?: string;
}

export class UserMetadataUpdateDto extends UserMetadataCreateDto {
  @ApiProperty() @IsString() id!: string;
}
```

#### Step 3: Implement the auth provider

```typescript
// providers/firebase-auth.provider.ts
import { Injectable } from '@nestjs/common';
import type { AuthProviderInterface, AuthorizedUser } from '@bitwild/rockets-core';

@Injectable()
export class FirebaseAuthProvider implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    // Validate with your external auth system
    // Return the user in Rockets shape
    const decoded = await verifyWithFirebase(token);
    return {
      id: decoded.uid,
      sub: decoded.uid,
      email: decoded.email,
      userRoles: decoded.roles?.map((name) => ({ role: { name } })) ?? [],
    };
  }
}
```

#### Step 4: Configure the module

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { RocketsModule } from '@bitwild/rockets';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './dto/user-metadata.dto';
import { FirebaseAuthProvider } from './providers/firebase-auth.provider';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [UserMetadataEntity],
      synchronize: true,
    }),
    RocketsModule.forRootAsync({
      inject: [FirebaseAuthProvider],
      useFactory: (authProvider: FirebaseAuthProvider) => ({
        authProvider,
        userMetadata: {
          createDto: UserMetadataCreateDto,
          updateDto: UserMetadataUpdateDto,
        },
      }),
      repositories: {
        module: TypeOrmRepositoryModule,
        userMetadata: { entity: UserMetadataEntity },
      },
    }),
  ],
  providers: [FirebaseAuthProvider],
})
export class AppModule {}
```

#### Step 5: Bootstrap

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(3000);
}
bootstrap();
```

### Testing the Setup

```bash
# Get your profile (external user + local metadata)
curl -X GET http://localhost:3000/me \
  -H "Authorization: Bearer <your-firebase-token>"

# Update your local metadata
curl -X PATCH http://localhost:3000/me \
  -H "Authorization: Bearer <your-firebase-token>" \
  -H "Content-Type: application/json" \
  -d '{"userMetadata": {"firstName": "Jane"}}'
```

---

## Configuration

### Auth Provider

Implement `AuthProviderInterface`:

```typescript
interface AuthProviderInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}

interface AuthorizedUser {
  id: string;
  sub: string;
  email?: string;
  userRoles?: { role: { name: string } }[];
  claims?: Record<string, unknown>;
}
```

### User Metadata

Configure DTOs used by the `/me` PATCH endpoint for validation:

```typescript
useFactory: () => ({
  authProvider,
  userMetadata: {
    createDto: UserMetadataCreateDto,
    updateDto: UserMetadataUpdateDto,
  },
})
```

### Repositories

Unified config for the userMetadata entity and additional standalone entities:

```typescript
repositories: {
  module: TypeOrmRepositoryModule,         // default adapter
  userMetadata: { entity: UserMetadataEntity },
  entities: [                               // optional additional entities
    { key: 'user', entity: UserEntity },
    { key: 'log', entity: LogEntity, module: FirestoreModule },  // override
  ],
}
```

Omit `repositories` when an upstream module (e.g., `rockets-server-auth`)
already registers the userMetadata repository.

### Resources

Declare CRUD resources alongside external auth:

```typescript
import { defineResource } from '@bitwild/rockets-core';

resources: [
  defineResource({
    key: 'pet',
    entity: PetEntity,
    path: 'pets',
    tags: ['Pets'],
    dto: { response: PetDto, create: PetCreateDto, update: PetUpdateDto },
  }),
]
```

See **[@bitwild/rockets-core](../rockets-core)** for the full `defineResource`
API and the `aggregateResources` pipeline.

### Other options

```typescript
RocketsModule.forRootAsync({
  useFactory: () => ({ authProvider, userMetadata: { ... } }),
  repositories: { ... },
  resources: [ ... ],
  enableGlobalGuard: true,    // default: true. Register AuthServerGuard as APP_GUARD
  disableController: {
    me: false,                // default: false. Set true to remove the /me controller
  },
  handlers: {                 // optional handler overrides (pass-through to core)
    upsertUserMetadata: MyCustomHandler,
    getUserMetadata: MyCustomHandler,
  },
})
```

---

## API Reference

### Endpoints

#### `GET /me`

Returns the current external user + local metadata.

```json
{
  "id": "firebase-uid-abc",
  "sub": "firebase-uid-abc",
  "email": "user@example.com",
  "userRoles": [{ "role": { "name": "user" } }],
  "userMetadata": {
    "firstName": "Jane",
    "lastName": "Doe"
  }
}
```

#### `PATCH /me`

Updates local metadata. The body is validated against
`userMetadata.updateDto`.

```json
{
  "userMetadata": {
    "firstName": "Jane"
  }
}
```

### Decorators

#### `@AuthUser()`

Inject the authorized user into a handler:

```typescript
import { AuthUser } from '@bitwild/rockets-common';
import type { AuthorizedUser } from '@bitwild/rockets-core';

@Get('/profile')
getProfile(@AuthUser() user: AuthorizedUser) {
  return user;
}
```

#### `@AuthPublic()`

Opt-out of the global guard:

```typescript
import { AuthPublic } from '@bitwild/rockets-core';

@Get('/public')
@AuthPublic()
getPublicInfo() {
  return { ok: true };
}
```

---

## Related packages

- **[@bitwild/rockets-core](../rockets-core)** — infrastructure only (no `/me`,
  no global guard opt-in). Use when you need the minimum.
- **[@bitwild/rockets-server-auth](https://www.npmjs.com/package/@bitwild/rockets-server-auth)** —
  full auth system (JWT, signup, login, OAuth, OTP, admin). Use when rockets is
  your source of truth for users.
