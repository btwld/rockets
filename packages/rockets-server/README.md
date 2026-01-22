<!-- markdownlint-disable MD013 -->
# Rockets Server

## Project

[![NPM Latest](https://img.shields.io/npm/v/@bitwild/rockets)](https://www.npmjs.com/package/@bitwild/rockets)
[![NPM Downloads](https://img.shields.io/npm/dw/@bitwild/rockets)](https://www.npmjs.com/package/@bitwild/rockets)
[![GH Last Commit](https://img.shields.io/github/last-commit/btwld/rockets?logo=github)](https://github.com/btwld/rockets)
[![GH Contrib](https://img.shields.io/github/contributors/btwld/rockets?logo=github)](https://github.com/btwld/rockets/graphs/contributors)
[![License](https://img.shields.io/npm/l/@bitwild/rockets)](https://github.com/btwld/rockets/blob/main/LICENSE.txt)

## Table of Contents

- [Introduction](#introduction)
  - [Overview](#overview)
  - [Key Features](#key-features)
  - [Installation](#installation)
- [Tutorial](#tutorial)
  - [Quick Start](#quick-start)
  - [Basic Setup](#basic-setup)
  - [Testing the Setup](#testing-the-setup)
- [Configuration](#configuration)
  - [Auth Provider](#auth-provider)
  - [User Metadata](#user-metadata)
- [API Reference](#api-reference)
  - [Endpoints](#endpoints)
  - [Decorators](#decorators)

---

## Introduction

### Overview

Rockets Server is a minimal NestJS infrastructure module that makes it easy to integrate with any third-party authentication system. By implementing a simple interface, you can authenticate users from any external provider (like Auth0, Firebase, Cognito, etc.) while Rockets Server handles storing and managing additional user metadata.

Simply implement the `AuthProviderInterface` for your authentication system:

### Key Features

- **🔐 Global Authentication Guard**: Validates JWT tokens using configurable auth providers
- **📋 User Metadata Management**: 2 endpoints for user metadata (`GET /me`, `PATCH /me`)
- **🛡️ Protected Route Handling**: Optional route protection with `AuthServerGuard` based on configuration flag
- **🔓 Public Route Support**: Opt-out authentication with `@AuthPublic()` decorator
- **🔌 Provider Pattern**: Integration point for external authentication systems
- **🛡️ Type Safety**: Full TypeScript support with interfaces
- **🧪 Testing Support**: Basic testing utilities

### What This Package Does NOT Provide

- ❌ No authentication endpoints (login, signup, password reset)
- ❌ No user CRUD operations or user management
- ❌ No OAuth, OTP, or advanced auth features
- ❌ No admin functionality
- ❌ No email services or notifications

**For these features, use `@bitwild/rockets-server-auth`**

### Installation

**About this package**:

> Rockets Server provides minimal authenticated user metadata functionality. It only includes 2 endpoints (`/me`) and a global auth guard. It does NOT include authentication endpoints, user management, or admin features. Use this package when you have an external authentication system and only need basic user metadata management.

**Version Requirements**:

- NestJS: `^10.0.0`
- Node.js: `>=18.0.0`
- TypeScript: `>=4.8.0`

Let's create a new NestJS project:

```bash
npx @nestjs/cli@10 new my-app-with-rockets --package-manager yarn --language TypeScript --strict
```

Install Rockets Server and required dependencies:

```bash
yarn add @bitwild/rockets-server @concepta/nestjs-typeorm-ext \
  @concepta/nestjs-common typeorm @nestjs/typeorm @nestjs/config \
  class-transformer class-validator sqlite3
```

---

## Tutorial

### Quick Start

This tutorial shows you how to set up the minimal rockets-server package with user metadata functionality.

### Basic Setup

#### Step 1: Create User Metadata Entity

First, create a user metadata entity to support extensible user data:

```typescript
// entities/user-metadata.entity.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_metadata')
export class UserMetadataEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  userId!: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  bio?: string;

  @Column({ nullable: true })
  location?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dateCreated!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  dateUpdated!: Date;
}
```

#### Step 2: Create User Metadata DTOs

Define DTOs for user metadata operations:

```typescript
// dto/user-metadata.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UserMetadataCreateDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;
}

export class UserMetadataUpdateDto extends UserMetadataCreateDto {}
```

#### Step 3: Create Authentication Provider

Create a custom authentication provider or use an existing one:

```typescript
// providers/mock-auth.provider.ts
import { Injectable } from '@nestjs/common';
import { AuthProviderInterface, AuthUserInterface } from '@bitwild/rockets-server';

@Injectable()
export class MockAuthProvider implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthUserInterface | null> {
    // Implement your token validation logic
    // This could integrate with Firebase, Auth0, or your custom auth system
    if (token === 'valid-token') {
      return {
        id: 'user-123',
        sub: 'user-123',
        email: 'user@example.com',
        userRoles: [{ role: { name: 'user' } }],
        userMetadata: {
          firstName: 'John',
          lastName: 'Doe',
        },
      };
    }
    return null;
  }
}
```

#### Step 4: Configure Your Module

Configure the base server module with your authentication provider and user metadata:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { RocketsModule } from '@bitwild/rockets-server';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './dto/user-metadata.dto';
import { MockAuthProvider } from './providers/mock-auth.provider';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Database configuration - SQLite in-memory for easy testing
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      dropSchema: true,
      entities: [UserMetadataEntity],
    }),

    // Provide the dynamic repository for user metadata
    TypeOrmExtModule.forFeature({
      userMetadata: { entity: UserMetadataEntity },
    }),

    // Base server module with global guard
    RocketsModule.forRootAsync({
      inject: [MockAuthProvider],
      useFactory: (authProvider: MockAuthProvider) => ({
        authProvider,
        settings: {},
        // Enable global guard (default true); can be turned off per-route via decorator
        enableGlobalGuard: true,
        userMetadata: {
          createDto: UserMetadataCreateDto,
          updateDto: UserMetadataUpdateDto,
        },
      }),
    }),
  ],
  providers: [MockAuthProvider],
})
export class AppModule {}
```

#### Step 5: Create Your Main Application

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable validation
  app.useGlobalPipes(new ValidationPipe());

  // Setup Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Rockets Server API')
    .setDescription('Core server API with authentication')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
  console.log('API Documentation: http://localhost:3000/api');
  console.log('Using SQLite in-memory database (data resets on restart)');
}
bootstrap();
```

### Testing the Setup

#### 1. Start Your Application

```bash
npm run start:dev
```

#### 2. Test the Only Available Endpoints

With the basic setup complete, your application provides:

- `GET /me` - Get the current authenticated user with metadata (only endpoint provided)
- `PATCH /me` - Update the current user's metadata (only endpoint provided)
- Any custom routes you create, automatically protected by the global `AuthServerGuard`
- Basic user metadata management with validation

**That's it!** This package only provides these 2 endpoints and a global guard.

#### 3. Access Protected Endpoint

```bash
curl -X GET http://localhost:3000/me \
  -H "Authorization: Bearer valid-token"
```

Expected response:

```json
{
  "id": "user-123",
  "sub": "user-123",
  "email": "user@example.com",
  "username": "testuser",
  "userRoles": [{ "role": { "name": "user" } }],
  "userMetadata": {
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

#### 4. Update User Profile

```bash
curl -X PATCH http://localhost:3000/me \
  -H "Authorization: Bearer valid-token" \
  -H "Content-Type: application/json" \
  -d '{
    "userMetadata": {
      "firstName": "Jane",
      "bio": "Software developer",
      "location": "San Francisco"
    }
  }'
```

🎉 **Congratulations!** You now have a minimal authenticated server with user metadata management.

**💡 Pro Tip**: This package only provides 2 endpoints and a global guard. For complete authentication features (login, signup, recovery, OAuth, admin), use `@bitwild/rockets-server-auth`.

### Troubleshooting

#### Common Issues

#### No authentication token provided (401)

If you receive 401 on protected routes, ensure you are passing a
valid `Authorization: Bearer <token>` header and that your
`authProvider.validateToken` returns an `AuthorizedUser`.

#### Module Resolution Errors

If you're getting dependency resolution errors:

1. **NestJS Version**: Ensure you're using NestJS `^10.0.0`
2. **Alpha Packages**: All `@concepta/*` packages should use the same alpha
   version (e.g., `^7.0.0-alpha.6`)
3. **Clean Installation**: Try deleting `node_modules` and `package-lock.json`,
   then run `yarn install`

---

## Configuration

Rockets Server has minimal configuration options since it only provides basic user metadata functionality.

### Auth Provider

The only required configuration is an authentication provider that implements `AuthProviderInterface`:

```typescript
interface AuthProviderInterface {
  validateToken(token: string): Promise<AuthUserInterface | null>;
}
```

### User Metadata

Configure user metadata DTOs for validation:

```typescript
RocketsModule.forRoot({
  authProvider: yourAuthProvider,
  userMetadata: {
    createDto: UserMetadataCreateDto,
    updateDto: UserMetadataUpdateDto,
  },
})
```

---

## API Reference

### Endpoints

Rockets Server provides exactly **2 endpoints**:

#### GET /me

Get current authenticated user with metadata.

**Headers:**

- `Authorization: Bearer <token>` (required)

**Response:**

```json
{
  "id": "string",
  "sub": "string", 
  "email": "string",
  "username": "string",
  "userRoles": [{ "role": { "name": "string" } }],
  "userMetadata": {
    "firstName": "string",
    "lastName": "string",
    "bio": "string",
    "location": "string"
  }
}
```

**Note:** The `userRoles` property uses a nested structure that matches the database schema. Extract role names using:

```typescript
const roleNames = user.userRoles?.map(ur => ur.role.name) || [];
```

#### PATCH /me

Update current user's metadata.

**Headers:**

- `Authorization: Bearer <token>` (required)
- `Content-Type: application/json`

**Body:**

```json
{
  "userMetadata": {
    "firstName": "string",
    "lastName": "string", 
    "bio": "string",
    "location": "string"
  }
}
```

### Decorators

#### @AuthUser()

Extract authenticated user from request:

```typescript
@Get('/custom-endpoint')
getUser(@AuthUser() user: AuthUserInterface) {
  return user;
}
```

#### @AuthPublic()

Opt-out of global authentication guard:

```typescript
@Get('/public')
@AuthPublic()
getPublicData() {
  return { message: 'This endpoint is public' };
}
```

---

## Need More Features?

This package provides minimal functionality. For a complete authentication system, use:

**[@bitwild/rockets-server-auth](https://www.npmjs.com/package/@bitwild/rockets-server-auth)**

Which includes:

- Login, signup, password recovery endpoints
- OAuth integration (Google, GitHub, Apple)
- OTP support
- Role-based access control
- Admin user management
- Email notifications
- And much more...
