# Rockets SDK Documentation

## Project

[![NPM Latest](https://img.shields.io/npm/v/@bitwild/rockets-server)](https://www.npmjs.com/package/@bitwild/rockets-server)
[![NPM Downloads](https://img.shields.io/npm/dw/@bitwild/rockets-server)](https://www.npmjs.com/package/@bitwild/rockets-server)
[![GH Last Commit](https://img.shields.io/github/last-commit/btwld/rockets?logo=github)](https://github.com/btwld/rockets)
[![GH Contrib](https://img.shields.io/github/contributors/btwld/rockets?logo=github)](https://github.com/btwld/rockets/graphs/contributors)

## Table of Contents

- [Introduction](#introduction)
  - [Overview](#overview)
  - [Key Features](#key-features)
  - [Installation](#installation)
- [Tutorial](#tutorial)
  - [Quick Start](#quick-start)
  - [Basic Setup](#basic-setup)
  - [Your First API](#your-first-api)
  - [Testing the Setup](#testing-the-setup)
- [How-to Guides](#how-to-guides)
  - [Configuration Overview](#configuration-overview)
  - [settings](#settings)
  - [authentication](#authentication)
  - [jwt](#jwt)
  - [authJwt](#authjwt)
  - [authLocal](#authlocal)
  - [authRecovery](#authrecovery)
  - [refresh](#refresh)
  - [authVerify](#authverify)
  - [authRouter](#authrouter)
  - [user](#user)
  - [password](#password)
  - [otp](#otp)
  - [email](#email)
  - [services](#services)
  - [crud](#crud)
  - [userCrud](#usercrud)
  - [User Management](#user-management)
  - [DTO Validation Patterns](#dto-validation-patterns)
  - [Entity Customization](#entity-customization)
- [Best Practices](#best-practices)
  - [Development Workflow](#development-workflow)
  - [DTO Design Patterns](#dto-design-patterns)
- [Explanation](#explanation)
  - [Architecture Overview](#architecture-overview)
  - [Design Decisions](#design-decisions)
  - [Core Concepts](#core-concepts)

---

## Introduction

### Overview

The Rockets SDK is a comprehensive, enterprise-grade toolkit for building
secure and scalable NestJS applications. It provides a unified solution that
combines authentication, user management, OTP verification, email
notifications, and API documentation into a single, cohesive package.

Built with TypeScript and following NestJS best practices, the Rockets SDK
eliminates the complexity of setting up authentication systems while
maintaining flexibility for customization and extension.

### Key Features

- **🔐 Complete Authentication System**: JWT tokens, local authentication,
  refresh tokens, and password recovery
- **🔗 OAuth Integration**: Support for Google, GitHub, and Apple OAuth
  providers by default, with custom providers support
- **👥 User Management**: Full CRUD operations, profile management, and
  password history
- **📱 OTP Support**: One-time password generation and validation for secure
  authentication
- **📧 Email Notifications**: Built-in email service with template support
- **📚 API Documentation**: Automatic Swagger/OpenAPI documentation generation
- **🔧 Highly Configurable**: Extensive configuration options for all modules
- **🏗️ Modular Architecture**: Use only what you need, extend what you want
- **🛡️ Type Safety**: Full TypeScript support with comprehensive interfaces
- **🧪 Testing Support**: Complete testing utilities and fixtures including
  e2e tests
- **🔌 Adapter Pattern**: Support for multiple database adapters

### Installation

**⚠️ CRITICAL: Alpha Version Issue**:

> **The current alpha version (7.0.0-alpha.6) has a dependency injection
> issue with AuthJwtGuard that prevents the minimal setup from working. This
> is a known issue being investigated.**

**Version Requirements**:

- NestJS: `^10.0.0`
- Node.js: `>=18.0.0`
- TypeScript: `>=4.8.0`

Let's create a new NestJS project:

```bash
npx @nestjs/cli@10 new my-app-with-rockets --package-manager yarn --language TypeScript --strict
```

Install the Rockets SDK and all required dependencies:

```bash
yarn add @bitwild/rockets-server @concepta/nestjs-typeorm-ext \
  @concepta/nestjs-common typeorm @nestjs/typeorm @nestjs/config \
  @nestjs/swagger class-transformer class-validator sqlite3
```

---

## Tutorial

### Quick Start

This tutorial will guide you through setting up a complete authentication
system with the Rockets SDK in just a few steps. We'll use SQLite in-memory
database for instant setup without any configuration.

### Basic Setup

#### Step 1: Create Your Entities

First, create the required database entities by extending the base entities
provided by the SDK:

```typescript
// entities/user.entity.ts
import { Entity, OneToMany } from 'typeorm';
import { UserSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserOtpEntity } from './user-otp.entity';
import { FederatedEntity } from './federated.entity';

@Entity()
export class UserEntity extends UserSqliteEntity {
  @OneToMany(() => UserOtpEntity, (userOtp) => userOtp.assignee)
  userOtps?: UserOtpEntity[];
  
  @OneToMany(() => FederatedEntity, (federated) => federated.assignee)
  federatedAccounts?: FederatedEntity[];
}
```

```typescript
// entities/user-otp.entity.ts
import { Entity, ManyToOne } from 'typeorm';
import { ReferenceIdInterface } from '@concepta/nestjs-common';
import { OtpSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserEntity } from './user.entity';

@Entity()
export class UserOtpEntity extends OtpSqliteEntity {
  @ManyToOne(() => UserEntity, (user) => user.userOtps)
  assignee!: ReferenceIdInterface;
}
```

```typescript
// entities/federated.entity.ts
import { Entity, ManyToOne } from 'typeorm';
import { ReferenceIdInterface } from '@concepta/nestjs-common';
import { FederatedSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { UserEntity } from './user.entity';

@Entity()
export class FederatedEntity extends FederatedSqliteEntity {
  @ManyToOne(() => UserEntity, (user) => user.federatedAccounts)
  assignee!: ReferenceIdInterface;
}
```

#### Step 2: Set Up Environment Variables (Production Only)

For production, create a `.env` file with JWT secrets:

```env
# Required for production
JWT_MODULE_ACCESS_SECRET=your-super-secret-jwt-access-key-here
# Optional - defaults to access secret if not provided
JWT_MODULE_REFRESH_SECRET=your-super-secret-jwt-refresh-key-here
NODE_ENV=development
```

**Note**: In development, JWT secrets are auto-generated if not provided.

#### Step 3: Configure Your Module

Create your main application module with the minimal Rockets SDK setup:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RocketsServerModule } from '@bitwild/rockets-server';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { UserEntity } from './entities/user.entity';
import { UserOtpEntity } from './entities/user-otp.entity';
import { FederatedEntity } from './entities/federated.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    
    // Database configuration - SQLite in-memory for easy testing
    TypeOrmExtModule.forRoot({
      type: 'sqlite',
      database: ':memory:', // In-memory database - no files created
      synchronize: true,    // Auto-create tables (dev only)
      autoLoadEntities: true,
      logging: false,       // Set to true to see SQL queries
      entities: [UserEntity, UserOtpEntity, FederatedEntity],
    }),
    
    // Rockets SDK configuration - minimal setup
    RocketsServerModule.forRootAsync({
      imports: [ConfigModule],
      // REQUIRED: User entity imports
      user: {
        imports: [
          TypeOrmExtModule.forFeature({
            user: { entity: UserEntity },
          }),
        ],
      },
      
      // REQUIRED: OTP entity imports
      otp: {
        imports: [
          TypeOrmExtModule.forFeature({
            userOtp: { entity: UserOtpEntity },
          }),
        ],
      },
      
      // OPTIONAL: Federated entity imports (required for OAuth)
      federated: {
        imports: [
          TypeOrmExtModule.forFeature({
            federated: { entity: FederatedEntity },
          }),
        ],
      },
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        // Required services
        services: {
          mailerService: {
            sendMail: (options: any) => {
              console.log('📧 Email would be sent:', {
                to: options.to,
                subject: options.subject,
                // Don't log the full content in examples
              });
              return Promise.resolve();
            },
          },
        },
        
        // Email and OTP settings
        settings: {
          email: {
            from: 'noreply@yourapp.com',
            baseUrl: 'http://localhost:3000',
            templates: {
              sendOtp: {
                fileName: 'otp.template.hbs',
                subject: 'Your verification code',
              },
            },
          },
          otp: {
            assignment: 'userOtp',
            category: 'auth-login',
            type: 'numeric',
            expiresIn: '10m',
          },
        },
        // Optional: Enable Admin endpoints
        // Provide a CRUD adapter + DTOs and import the repository via
        // TypeOrmModule.forFeature([...]). Enable by passing `admin` at the
        // top-level of RocketsServerModule.forRoot/forRootAsync options.
        // See the admin how-to section for a complete example.
      }),
    }),
  ],
})
export class AppModule {}
```

#### Step 4: Create Your Main Application

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ExceptionsFilter } from '@concepta/nestjs-common';
import { SwaggerUiService } from '@concepta/nestjs-swagger-ui';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Enable validation
  app.useGlobalPipes(new ValidationPipe());
  // get the swagger ui service, and set it up
  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();
  swaggerUiService.setup(app);

  const exceptionsFilter = app.get(HttpAdapterHost);
  app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));

  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
  console.log('API Documentation: http://localhost:3000/api');
  console.log('Using SQLite in-memory database (data resets on restart)');
}
bootstrap();
```

### Your First API

With the basic setup complete, your application now provides these endpoints:

#### Authentication Endpoints

- `POST /signup` - Register a new user
- `POST /token/password` - Login with username/password (returns 200 OK with tokens)
- `POST /token/refresh` - Refresh access token
- `POST /recovery/login` - Initiate username recovery
- `POST /recovery/password` - Initiate password reset
- `PATCH /recovery/password` - Reset password with passcode
- `GET /recovery/passcode/:passcode` - Validate recovery passcode

#### OAuth Endpoints

- `GET /oauth/authorize` - Redirect to OAuth provider (Google, GitHub, Apple)
- `GET /oauth/callback` - Handle OAuth callback and return tokens
- `POST /oauth/callback` - Handle OAuth callback via POST method

#### User Management Endpoints

- `GET /user` - Get current user profile
- `PATCH /user` - Update current user profile

#### Admin Endpoints (optional)

If you enable the admin module (see How-to Guides > admin), these routes become
available and are protected by `AdminGuard`:

- `GET /admin/users` - List users
- `GET /admin/users/:id` - Get a user
- `POST /admin/users` - Create a user
- `PATCH /admin/users/:id` - Update a user
- `PUT /admin/users/:id` - Replace a user
- `DELETE /admin/users/:id` - Delete a user

#### OTP Endpoints

- `POST /otp` - Send OTP to user email (returns 200 OK)
- `PATCH /otp` - Confirm OTP code (returns 200 OK with tokens)

### Testing the Setup

#### 1. Start Your Application

```bash
npm run start:dev
```

#### 2. Register a New User

```bash
curl -X POST http://localhost:3000/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "username": "testuser"
  }'
```

Expected response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "username": "testuser",
  "active": true,
  "dateCreated": "2024-01-01T00:00:00.000Z",
  "dateUpdated": "2024-01-01T00:00:00.000Z",
  "dateDeleted": null,
  "version": 1
}
```

#### 3. Login and Get Access Token

```bash
curl -X POST http://localhost:3000/token/password \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "SecurePass123"
  }'
```

Expected response (200 OK):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Note**: The login endpoint returns a 200 OK status (not 201 Created) as it's
retrieving tokens, not creating a new resource.

**Defaults Working**: All authentication endpoints work out-of-the-box with
sensible defaults.

#### 4. Access Protected Endpoint

```bash
curl -X GET http://localhost:3000/user \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

Expected response:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "username": "testuser",
  "active": true,
  "dateCreated": "2024-01-01T00:00:00.000Z",
  "dateUpdated": "2024-01-01T00:00:00.000Z",
  "dateDeleted": null,
  "version": 1
}
```

#### 5. Test OTP Functionality

```bash
# Send OTP (returns 200 OK)
curl -X POST http://localhost:3000/otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'

# Check console for the "email" that would be sent with the OTP code
# Then confirm with the code (replace 123456 with actual code)
# Returns 200 OK with tokens
curl -X PATCH http://localhost:3000/otp \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "passcode": "123456"
  }'
```

Expected OTP confirm response (200 OK):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### 6. Test OAuth Functionality

```bash
# Redirect to Google OAuth (returns 200 OK)
curl -X GET "http://localhost:3000/oauth/authorize?provider=google&scopes=email,profile"

# Redirect to GitHub OAuth (returns 200 OK)
curl -X GET "http://localhost:3000/oauth/authorize?provider=github&scopes=user,email"

# Redirect to Apple OAuth (returns 200 OK)
curl -X GET "http://localhost:3000/oauth/authorize?provider=apple&scopes=email,name"

# Handle OAuth callback (returns 200 OK with tokens)
curl -X GET "http://localhost:3000/oauth/callback?provider=google"
```

Expected OAuth callback response (200 OK):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

🎉 **Congratulations!** You now have a fully functional authentication system
with user management, JWT tokens, OAuth integration, and API documentation
running with minimal configuration.

**💡 Pro Tip**: Since we're using an in-memory database, all data is lost when
you restart the application. This is perfect for testing and development!

### Troubleshooting

#### Common Issues

#### AuthJwtGuard Dependency Error

If you encounter this error:

```text
Nest can't resolve dependencies of the AuthJwtGuard
(AUTHENTICATION_MODULE_SETTINGS_TOKEN, ?). Please make sure that the
argument Reflector at index [1] is available in the AuthJwtModule context.
```

#### Module Resolution Errors

If you're getting dependency resolution errors:

1. **NestJS Version**: Ensure you're using NestJS `^10.0.0`
2. **Alpha Packages**: All `@concepta/*` packages should use the same alpha
   version (e.g., `^7.0.0-alpha.6`)
3. **Clean Installation**: Try deleting `node_modules` and `package-lock.json`,
   then run `yarn install`

#### Module Resolution Errors (TypeScript)

If TypeScript can't find modules like `@concepta/nestjs-typeorm-ext`:

```bash
yarn add @concepta/nestjs-typeorm-ext @concepta/nestjs-common \
  --save
```

All dependencies listed in the installation section are required and must be
installed explicitly.

---

## How-to Guides

This section provides comprehensive guides for every configuration option
available in the `RocketsServerOptionsInterface`. Each guide explains what the
option does, how it connects with core modules, when you should customize it
(since defaults are provided), and includes real-world examples.

### Configuration Overview

The Rockets SDK uses a hierarchical configuration system with the following structure:

```typescript
interface RocketsServerOptionsInterface {
  settings?: RocketsServerSettingsInterface;
  swagger?: SwaggerUiOptionsInterface;
  authentication?: AuthenticationOptionsInterface;
  jwt?: JwtOptions;
  authJwt?: AuthJwtOptionsInterface;
  authLocal?: AuthLocalOptionsInterface;
  authRecovery?: AuthRecoveryOptionsInterface;
  refresh?: AuthRefreshOptions;
  authVerify?: AuthVerifyOptionsInterface;
  authRouter?: AuthRouterOptionsInterface;
  user?: UserOptionsInterface;
  password?: PasswordOptionsInterface;
  otp?: OtpOptionsInterface;
  email?: Partial<EmailOptionsInterface>;
  services: {
    userModelService?: RocketsServerUserModelServiceInterface;
    notificationService?: RocketsServerNotificationServiceInterface;
    verifyTokenService?: VerifyTokenService;
    issueTokenService?: IssueTokenServiceInterface;
    validateTokenService?: ValidateTokenServiceInterface;
    validateUserService?: AuthLocalValidateUserServiceInterface;
    userPasswordService?: UserPasswordServiceInterface;
    userPasswordHistoryService?: UserPasswordHistoryServiceInterface;
    userAccessQueryService?: CanAccess;
    mailerService: EmailServiceInterface; // Required
  };
}
```

---

### settings

**What it does**: Global settings that configure the custom OTP and email
services provided by RocketsServer. These settings are used by the custom OTP
controller and notification services, not by the core authentication modules.

**Core services it connects to**: RocketsServerOtpService,
RocketsServerNotificationService

**When to update**: Required when using the custom OTP endpoints
(`POST /otp`, `PATCH /otp`). The defaults use placeholder values that won't
work in real applications.

**Real-world example**: Setting up email configuration for the custom OTP
system:

```typescript
settings: {
  email: {
    from: 'noreply@mycompany.com',
    baseUrl: 'https://app.mycompany.com',
    tokenUrlFormatter: (baseUrl, token) =>
      `${baseUrl}/auth/verify?token=${token}&utm_source=email`,
    templates: {
      sendOtp: {
        fileName: 'custom-otp.template.hbs',
        subject: 'Your {{appName}} verification code - expires in 10 minutes',
      },
    },
  },
  otp: {
    assignment: 'userOtp',
    category: 'auth-login',
    type: 'numeric', // Use 6-digit numeric codes instead of UUIDs
    expiresIn: '10m', // Shorter expiry for security
  },
}
```

---

### authentication

**What it does**: Core authentication module configuration that handles token
verification, validation services and the payload of the token. It provides
three key services:

- **verifyTokenService**: Handles two-step token verification - first
  cryptographically verifying JWT tokens using JwtVerifyTokenService, then
  optionally validating the decoded payload through a validateTokenService.
  Used by authentication guards and protected routes.

- **issueTokenService**: Generates and signs new JWT tokens for authenticated
  users. Creates both access and refresh tokens with user payload data and
  builds complete authentication responses. Used during login, signup, and
  token refresh flows.

- **validateTokenService**: Optional service for custom business logic
  validation beyond basic JWT verification. Can check user existence, token
  blacklists, account status, or any other custom validation rules.

**Core modules it connects to**: AuthenticationModule (the base authentication
  system)

**When to update**: When you need to customize core authentication behavior,
provide custom token services or change how the token payload is structured.
Common scenarios include:

- Implementing custom token verification logic
- Adding business-specific token validation rules
- Modifying token generation and payload structure
- Integrating with external authentication systems

**Real-world example**: Custom authentication configuration:

```typescript
authentication: {
  settings: {
    enableGuards: true, // Default: true
  },
  // Optional: Custom services (defaults are provided)
  issueTokenService: new CustomTokenIssuanceService(),
  verifyTokenService: new CustomTokenVerificationService(),
  validateTokenService: new CustomTokenValidationService(),
}
```

**Note**: All token services have working defaults. Only customize if you need
specific business logic.

---

### jwt

**What it does**: JWT token configuration including secrets, expiration times,
and token services.

**Core modules it connects to**: JwtModule, AuthJwtModule, AuthRefreshModule

**When to update**: Only needed if loading JWT settings from a source other than
environment variables (e.g. config files, external services, etc).

**Environment Variables**: The JWT module automatically uses these environment
variables with sensible defaults:

- `JWT_MODULE_DEFAULT_EXPIRES_IN` (default: `'1h'`)
- `JWT_MODULE_ACCESS_EXPIRES_IN` (default: `'1h'`)
- `JWT_MODULE_REFRESH_EXPIRES_IN` (default: `'99y'`)
- `JWT_MODULE_ACCESS_SECRET` (required in production, auto-generated in
  development, if not provided)
- `JWT_MODULE_REFRESH_SECRET` (defaults to access secret if not provided)

**Default Behavior**:

- **Development**: JWT secrets are auto-generated if not provided
- **Production**: `JWT_MODULE_ACCESS_SECRET` is required (with
  NODE_ENV=production)
- **Token Services**: Default `JwtIssueTokenService` and
  `JwtVerifyTokenService` are provided
- **Multiple Token Types**: Separate access and refresh token handling

**Security Notes**:

- Production requires explicit JWT secrets for security
- Development auto-generates secrets for convenience
- Refresh tokens have longer expiration by default
- All token operations are handled automatically

**Real-world example**: Custom JWT configuration (optional - defaults work
for most cases):

```typescript
jwt: {
  settings: {
    default: {
      signOptions: {
        issuer: 'mycompany.com',
        audience: 'mycompany-api',
      },
    },
    access: {
      signOptions: {
        issuer: 'mycompany.com',
        audience: 'mycompany-api',
      },
    },
    refresh: {
      signOptions: {
        issuer: 'mycompany.com',
        audience: 'mycompany-refresh',
      },
    },
  },
  // Optional: Custom services (defaults are provided)
  jwtIssueTokenService: new CustomJwtIssueService(),
  jwtVerifyTokenService: new CustomJwtVerifyService(),
}
```

**Note**: Environment variables are automatically used for secrets and
expiration times. Only customize `jwt.settings` if you need specific JWT
options like issuer/audience, you can also use the environment variables to
configure the JWT module.

---

### authJwt

**What it does**: JWT-based authentication strategy configuration, including how
tokens are extracted from requests.

**Core modules it connects to**: AuthJwtModule, provides JWT authentication
guards and strategies

**When to update**: When you need custom token extraction logic or want to
modify JWT authentication behavior.

**Real-world example**: Custom token extraction for mobile apps that send tokens
in custom headers:

```typescript
authJwt: {
  settings: {
    jwtFromRequest: ExtractJwt.fromExtractors([
      ExtractJwt.fromAuthHeaderAsBearerToken(), // Standard Bearer token
      ExtractJwt.fromHeader('x-api-token'), // Custom header for mobile
      (request) => {
        // Custom extraction from cookies for web apps
        return request.cookies?.access_token;
      },
    ]),
  },
  // Optional settings (defaults are sensible)
  appGuard: true, // Default: true - set true to apply JWT guard globally
  // Optional services (defaults are provided)
  verifyTokenService: new CustomJwtVerifyService(),
  userModelService: new CustomUserLookupService(),
}
```

**Note**: Default token extraction uses standard Bearer token from
Authorization header. Only customize if you need alternative token sources.

---

### authLocal

**What it does**: Local authentication (username/password) configuration and
validation services.

**Core modules it connects to**: AuthLocalModule, handles login endpoint and
credential validation

**When to update**: When you need custom password validation, user lookup logic,
or want to integrate with external authentication systems.

**Real-world example**: Custom local authentication with email login:

```typescript
authLocal: {
  settings: {
    usernameField: 'email', // Default: 'username'
    passwordField: 'password', // Default: 'password'
  },
  // Optional services (defaults work with TypeORM entities)
  validateUserService: new CustomUserValidationService(),
  userModelService: new CustomUserModelService(),
  issueTokenService: new CustomTokenIssuanceService(),
}
```

**Environment Variables**:

- `AUTH_LOCAL_USERNAME_FIELD` - defaults to `'username'`
- `AUTH_LOCAL_PASSWORD_FIELD` - defaults to `'password'`

**Note**: The default services work automatically with your TypeORM User entity.
Only customize if you need specific validation logic.

---

### authRecovery

**What it does**: Password recovery and account recovery functionality including
email notifications and OTP generation.

**Core modules it connects to**: AuthRecoveryModule, provides password reset
endpoints

**When to update**: When you need custom recovery flows, different notification
methods, or integration with external services.

**Real-world example**: Multi-channel recovery system with SMS and email options:

```typescript
authRecovery: {
  settings: {
    tokenExpiresIn: '1h', // Recovery token expiration
    maxAttempts: 3, // Maximum recovery attempts
  },
  emailService: new CustomEmailService(),
  otpService: new CustomOtpService(),
  userModelService: new CustomUserModelService(),
  userPasswordService: new CustomPasswordService(),
  notificationService: new MultiChannelNotificationService(), // SMS + Email
}
```

---

### refresh

**What it does**: Refresh token configuration for maintaining user sessions
without requiring re-authentication.

**Core modules it connects to**: AuthRefreshModule, provides token refresh
endpoints

**When to update**: When you need custom refresh token behavior, different
expiration strategies, or want to implement token rotation.

**Real-world example**: Secure refresh token rotation for high-security
applications:

```typescript
refresh: {
  settings: {
    jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
    tokenRotation: true, // Issue new refresh token on each use
    revokeOnUse: true, // Revoke old refresh token
  },
  verifyTokenService: new SecureRefreshTokenVerifyService(),
  issueTokenService: new RotatingTokenIssueService(),
  userModelService: new AuditableUserModelService(), // Log refresh attempts
}
```

---

### authVerify

**What it does**: Email verification and account verification functionality.

**Core modules it connects to**: AuthVerifyModule, provides email verification
endpoints

**When to update**: When you need custom verification flows, different
verification methods, or want to integrate with external verification services.

**Real-world example**: Multi-step verification with phone and email:

```typescript
authVerify: {
  settings: {
    verificationRequired: true, // Require verification before login
    verificationExpiresIn: '24h',
  },
  emailService: new CustomEmailService(),
  otpService: new CustomOtpService(),
  userModelService: new CustomUserModelService(),
  notificationService: new MultiStepVerificationService(), // Email + SMS
}
```

---

### authRouter

**What it does**: OAuth router configuration that handles routing to different
OAuth providers (Google, GitHub, Apple) based on the provider parameter in
the request.

**Core modules it connects to**: AuthRouterModule, provides OAuth routing and
guards

**When to update**: When you need to add or remove OAuth providers, customize
OAuth guard behavior, or modify OAuth routing logic.

**Real-world example**: Custom OAuth configuration with multiple providers:

```typescript
authRouter: {
  guards: [
    { name: 'google', guard: AuthGoogleGuard },
    { name: 'github', guard: AuthGithubGuard },
    { name: 'apple', guard: AuthAppleGuard },
    // Add custom OAuth providers
    { name: 'custom', guard: CustomOAuthGuard },
  ],
  settings: {
    // Custom OAuth router settings
    defaultProvider: 'google',
    enableProviderValidation: true,
  },
}
```

**Default Configuration**: The SDK automatically configures Google, GitHub, and
Apple OAuth providers with sensible defaults.

**OAuth Flow**:

1. Client calls `/oauth/authorize?provider=google&scopes=email profile`
2. AuthRouterGuard routes to the appropriate OAuth guard based on provider
3. OAuth guard redirects to the provider's authorization URL
4. User authenticates with the OAuth provider
5. Provider redirects back to `/oauth/callback?provider=google`
6. AuthRouterGuard processes the callback and returns JWT tokens

---

### user

**What it does**: User management configuration including CRUD operations,
password management, and access control.

**Core modules it connects to**: UserModule, provides user management endpoints

**When to update**: When you need custom user management logic, different access
control, or want to integrate with external user systems.

**Real-world example**: Enterprise user management with role-based access
control:

```typescript
user: {
  imports: [
    TypeOrmExtModule.forFeature({
      user: { entity: UserEntity },
      userProfile: { entity: UserProfileEntity },
      userPasswordHistory: { entity: UserPasswordHistoryEntity },
    }),
  ],
  settings: {
    enableProfiles: true, // Enable user profiles
    enablePasswordHistory: true, // Track password history
  },
  userModelService: new EnterpriseUserModelService(),
  userPasswordService: new SecurePasswordService(),
  userAccessQueryService: new RoleBasedAccessService(),
  userPasswordHistoryService: new PasswordHistoryService(),
}
```

---

### password

**What it does**: Password policy and validation configuration.

**Core modules it connects to**: PasswordModule, provides password validation
across the system

**When to update**: When you need to enforce specific password policies or
integrate with external password validation services.

**Real-world example**: Enterprise password policy with complexity requirements:

```typescript
password: {
  settings: {
    minPasswordStrength: 3, // 0-4 scale (default: 2)
    maxPasswordAttempts: 5, // Default: 3
    requireCurrentToUpdate: true, // Default: false
    passwordHistory: 12, // Remember last 12 passwords
  },
}
```

**Environment Variables**:

- `PASSWORD_MIN_PASSWORD_STRENGTH` - defaults to `4` if production, `0` if
  development (0-4 scale)
- `PASSWORD_MAX_PASSWORD_ATTEMPTS` - defaults to `3`
- `PASSWORD_REQUIRE_CURRENT_TO_UPDATE` - defaults to `false`

**Note**: Password strength is automatically calculated using zxcvbn. History
tracking is optional and requires additional configuration.

---

### otp

**What it does**: One-time password configuration for the OTP system.

**Core modules it connects to**: OtpModule, provides OTP generation and
validation

**When to update**: When you need custom OTP behavior, different OTP types, or
want to integrate with external OTP services.

**Interface**: `OtpSettingsInterface` from `@concepta/nestjs-otp`

```typescript
interface OtpSettingsInterface {
  types: Record<string, OtpTypeServiceInterface>;
  clearOnCreate: boolean;
  keepHistoryDays?: number;
  rateSeconds?: number;
  rateThreshold?: number;
}
```

**Environment Variables**:

- `OTP_CLEAR_ON_CREATE` - defaults to `false`
- `OTP_KEEP_HISTORY_DAYS` - no default (optional)
- `OTP_RATE_SECONDS` - no default (optional)  
- `OTP_RATE_THRESHOLD` - no default (optional)

**Real-world example**: High-security OTP configuration with rate limiting:

```typescript
otp: {
  imports: [
    TypeOrmExtModule.forFeature({
      userOtp: { entity: UserOtpEntity },
    }),
  ],
  settings: {
    types: {
      uuid: {
        generator: () => require('uuid').v4(),
        validator: (value: string, expected: string) => value === expected,
      },
    },
    clearOnCreate: true, // Clear old OTPs when creating new ones
    keepHistoryDays: 30, // Keep OTP history for 30 days
    rateSeconds: 60, // Minimum 60 seconds between OTP requests
    rateThreshold: 5, // Maximum 5 attempts within rate window
  },
}
```

---

### email

**What it does**: Email service configuration for sending notifications and
templates.

**Core modules it connects to**: EmailModule, used by AuthRecoveryModule and
AuthVerifyModule

**When to update**: When you need to use a different email service provider or
customize email sending behavior.

**Interface**: `EmailServiceInterface` from `@concepta/nestjs-email`

**Configuration example**:

```typescript
email: {
  service: new YourCustomEmailService(), // Must implement EmailServiceInterface
  settings: {}, // Settings object is empty
}
```

---

### services

The `services` object contains injectable services that customize core
functionality. Each service has specific responsibilities:

#### services.userModelService

**What it does**: Core user lookup service used across multiple authentication
modules.

**Core modules it connects to**: AuthJwtModule, AuthRefreshModule,
AuthLocalModule, AuthRecoveryModule

**When to update**: When you need to integrate with external user systems or
implement custom user lookup logic.

**Interface**: `UserModelServiceInterface` from `@concepta/nestjs-user`

**Configuration example**:

```typescript
services: {
  userModelService: new YourCustomUserModelService(), // Must implement UserModelServiceInterface
}
```

#### services.notificationService

**What it does**: Handles sending notifications for recovery and verification
processes.

**Core modules it connects to**: AuthRecoveryModule, AuthVerifyModule

**When to update**: When you need custom notification channels (SMS, push
notifications) or integration with external notification services.

**Interface**: `NotificationServiceInterface` from `@concepta/nestjs-authentication`

**Configuration example**:

```typescript
services: {
  notificationService: new YourCustomNotificationService(), // Must implement NotificationServiceInterface
}
```

#### services.verifyTokenService

**What it does**: Verifies JWT tokens for authentication.

**Core modules it connects to**: AuthenticationModule, JwtModule

**When to update**: When you need custom token verification logic or integration
with external token validation services.

**Interface**: `VerifyTokenServiceInterface` from `@concepta/nestjs-authentication`

**Configuration example**:

```typescript
services: {
  verifyTokenService: new YourCustomVerifyTokenService(), // Must implement VerifyTokenServiceInterface
}
```

#### services.issueTokenService

**What it does**: Issues JWT tokens for authenticated users.

**Core modules it connects to**: AuthenticationModule, AuthLocalModule,
AuthRefreshModule

**When to update**: When you need custom token issuance logic or want to include
additional claims.

**Interface**: `IssueTokenServiceInterface` from `@concepta/nestjs-authentication`

**Configuration example**:

```typescript
services: {
  issueTokenService: new YourCustomIssueTokenService(), // Must implement IssueTokenServiceInterface
}
```

#### services.validateTokenService

**What it does**: Validates token structure and claims.

**Core modules it connects to**: AuthenticationModule

**When to update**: When you need custom token validation rules or security
checks.

**Interface**: `ValidateTokenServiceInterface` from `@concepta/nestjs-authentication`

**Configuration example**:

```typescript
services: {
  validateTokenService: new YourCustomValidateTokenService(), // Must implement ValidateTokenServiceInterface
}
```

#### services.validateUserService

**What it does**: Validates user credentials during local authentication.

**Core modules it connects to**: AuthLocalModule

**When to update**: When you need custom credential validation or integration
with external authentication systems.

**Interface**: `ValidateUserServiceInterface` from `@concepta/nestjs-authentication`

**Configuration example**:

```typescript
services: {
  validateUserService: new YourCustomValidateUserService(), // Must implement ValidateUserServiceInterface
}
```

#### services.userPasswordService

**What it does**: Handles password operations including hashing and validation.

**Core modules it connects to**: UserModule, AuthRecoveryModule

**When to update**: When you need custom password hashing algorithms or password
policy enforcement.

**Interface**: `UserPasswordServiceInterface` from `@concepta/nestjs-user`

**Configuration example**:

```typescript
services: {
  userPasswordService: new YourCustomUserPasswordService(), // Must implement UserPasswordServiceInterface
}
```

#### services.userPasswordHistoryService

**What it does**: Manages password history to prevent password reuse.

**Core modules it connects to**: UserModule

**When to update**: When you need to enforce password history policies or custom
password tracking.

**Interface**: `UserPasswordHistoryServiceInterface` from `@concepta/nestjs-user`

**Configuration example**:

```typescript
services: {
  userPasswordHistoryService: new YourCustomPasswordHistoryService(), // Must implement UserPasswordHistoryServiceInterface
}
```

#### services.userAccessQueryService

**What it does**: Handles access control and permission queries.

**Core modules it connects to**: UserModule

**When to update**: When you need custom access control logic or integration
with external authorization systems.

**Interface**: `CanAccess` from `@concepta/nestjs-common`

**Configuration example**:

```typescript
services: {
  userAccessQueryService: new YourCustomAccessQueryService(), // Must implement CanAccess
}
```

#### services.mailerService (Required)

**What it does**: Core email sending service used throughout the system.

**Core modules it connects to**: EmailModule, AuthRecoveryModule,
AuthVerifyModule, OTP system

**When to update**: Always required. You must provide a working email service
for production.

**Interface**: `EmailServiceInterface` from `@concepta/nestjs-email`

**Configuration example**:

```typescript
services: {
  mailerService: new YourCustomMailerService(), // Must implement EmailServiceInterface
}
```

---

### crud

Add a new CRUD endpoint for any entity using `@concepta/nestjs-crud` with
minimal boilerplate. This section provides step-by-step instructions for AI
agents to implement CRUD operations following the v7.0.0-alpha.6 patterns.

**IMPORTANT FOR AI AGENTS**: Follow this exact pattern when implementing
CRUD functionality. The pattern uses `ConfigurableCrudBuilder` plus a
`TypeOrmCrudAdapter` and requires specific imports and structure.

#### Required Imports for CRUD Implementation

**Always import these modules for CRUD:**

```typescript
import { CrudModule } from '@concepta/nestjs-crud'; // For CrudModule.forRoot()
import { TypeOrmModule } from '@nestjs/typeorm'; // For TypeOrmModule.forFeature()
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud'; // For the adapter pattern
```

**DO NOT use TypeOrmExtModule for CRUD** - this is only for model services.
Use standard TypeOrmModule instead.

#### Module Import Requirements

**Required in your module:**

```typescript
@Module({
  imports: [
    CrudModule.forRoot({}), // Required for CRUD functionality
    TypeOrmModule.forFeature([ProjectEntity]), // Required for repository injection
    // NOT TypeOrmExtModule - that's only for model services
  ],
  // ... rest of module
})
```

#### Complete CRUD Implementation Pattern

#### 1) Define your Entity

```typescript
// entities/project.entity.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('project')
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
```

#### 2) Define your DTOs

```typescript
// dto/project/project.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class ProjectDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

// dto/project/project-create.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ProjectCreateDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;
}

// dto/project/project-update.dto.ts
import { PartialType } from '@nestjs/swagger';
import { ProjectCreateDto } from './project-create.dto';

export class ProjectUpdateDto extends PartialType(ProjectCreateDto) {}

// dto/project/project-paginated.dto.ts
import { CrudResponsePaginatedDto } from '@concepta/nestjs-crud';
import { ProjectDto } from './project.dto';

export class ProjectPaginatedDto extends CrudResponsePaginatedDto(ProjectDto) {}
```

#### 3) Create a TypeOrmCrudAdapter (REQUIRED PATTERN)

**AI AGENTS: This is the correct adapter pattern for v7.0.0-alpha.6:**

```typescript
// adapters/project-typeorm-crud.adapter.ts
import { Repository } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { ProjectEntity } from '../entities/project.entity';

/**
 * Project CRUD Adapter using TypeORM
 * 
 * PATTERN NOTE: This follows the standard pattern where:
 * - Extends TypeOrmCrudAdapter<EntityType>
 * - Injects Repository<EntityType> via @InjectRepository
 * - Calls super(repo) to initialize the adapter
 */
@Injectable()
export class ProjectTypeOrmCrudAdapter extends TypeOrmCrudAdapter<ProjectEntity> {
  constructor(
    @InjectRepository(ProjectEntity)
    repo: Repository<ProjectEntity>,
  ) {
    super(repo);
  }
}
```

#### 4) Create a CRUD Builder with build() Method

```typescript
// crud/project-crud.builder.ts
import { ApiTags } from '@nestjs/swagger';
import { ConfigurableCrudBuilder } from '@concepta/nestjs-crud';
import { ProjectEntity } from '../entities/project.entity';
import { ProjectDto } from '../dto/project/project.dto';
import { ProjectCreateDto } from '../dto/project/project-create.dto';
import { ProjectUpdateDto } from '../dto/project/project-update.dto';
import { ProjectPaginatedDto } from '../dto/project/project-paginated.dto';
import { ProjectTypeOrmCrudAdapter } from '../adapters/project-typeorm-crud.adapter';

export const PROJECT_CRUD_SERVICE_TOKEN = Symbol('PROJECT_CRUD_SERVICE_TOKEN');

export class ProjectCrudBuilder extends ConfigurableCrudBuilder<
  ProjectEntity,
  ProjectCreateDto,
  ProjectUpdateDto
> {
  constructor() {
    super({
      service: {
        injectionToken: PROJECT_CRUD_SERVICE_TOKEN,
        adapter: ProjectTypeOrmCrudAdapter,
      },
      controller: {
        path: 'projects',
        model: {
          type: ProjectDto,
          paginatedType: ProjectPaginatedDto,
        },
        extraDecorators: [ApiTags('projects')],
      },
      getMany: {},
      getOne: {},
      createOne: { dto: ProjectCreateDto },
      updateOne: { dto: ProjectUpdateDto },
      replaceOne: { dto: ProjectUpdateDto },
      deleteOne: {},
    });
  }
}
```

#### 5) Use build() Method to Get ConfigurableClasses

**AI AGENTS: You must call .build() and extract the classes:**

```typescript
// crud/project-crud.builder.ts (continued)

// Call build() to get the configurable classes
const {
  ConfigurableServiceClass,
  ConfigurableControllerClass,
} = new ProjectCrudBuilder().build();

// Export the classes that extend the configurable classes
export class ProjectCrudService extends ConfigurableServiceClass {
  // Inherits all CRUD operations: getMany, getOne, createOne, updateOne, replaceOne, deleteOne
}

export class ProjectController extends ConfigurableControllerClass {
  // Inherits all CRUD endpoints:
  // GET /projects (getMany)
  // GET /projects/:id (getOne) 
  // POST /projects (createOne)
  // PATCH /projects/:id (updateOne)
  // PUT /projects/:id (replaceOne)
  // DELETE /projects/:id (deleteOne)
}

```

#### 6) Register in a Module (COMPLETE PATTERN)

**AI AGENTS: This is the exact module pattern you must follow:**

```typescript
// modules/project.module.ts
import { Module } from '@nestjs/common';
import { CrudModule } from '@concepta/nestjs-crud'; // REQUIRED
import { TypeOrmModule } from '@nestjs/typeorm'; // REQUIRED (NOT TypeOrmExtModule)
import { ProjectEntity } from '../entities/project.entity';
import { ProjectTypeOrmCrudAdapter } from '../adapters/project-typeorm-crud.adapter';
import { ProjectController, ProjectServiceProvider } from '../crud/project-crud.builder';

@Module({
  imports: [
    CrudModule.forRoot({}), // REQUIRED for CRUD functionality
    TypeOrmModule.forFeature([ProjectEntity]), // REQUIRED for repository injection
  ],
  providers: [
    ProjectTypeOrmCrudAdapter, // The adapter with @Injectable
    ProjectServiceProvider, // From the builder.build() result
  ],
  controllers: [
    ProjectController, // From the builder.build() result
  ],
})
export class ProjectModule {}
```

#### 7) Wire up in Main App Module

```typescript
// app.module.ts (add to imports)
@Module({
  imports: [
    // ... other imports
    ProjectModule, // Your new CRUD module
  ],
})
export class AppModule {}
```

#### Key Patterns for AI Agents

**1. Adapter Pattern**: Always create a `EntityTypeOrmCrudAdapter` that extends
`TypeOrmCrudAdapter<Entity>` (or any other adapter you may need) and injects
`Repository<Entity>`.

**2. Builder Pattern**: Use `ConfigurableCrudBuilder` and call `.build()` to
get `ConfigurableServiceClass` and `ConfigurableControllerClass`.

**3. Module Imports**: Always use:

- `CrudModule.forRoot({})` - for CRUD functionality
- `TypeOrmModule.forFeature([Entity])` - for repository injection
- **NOT** `TypeOrmExtModule` - that's only for model services

**4. Service Token**: Create a unique `Symbol` for each CRUD service token.

**5. DTOs**: Always create separate DTOs for Create, Update, Response, and
Paginated types.

#### Generated Endpoints

The CRUD builder automatically generates these RESTful endpoints:

- `GET /projects` - List projects with pagination and filtering
- `GET /projects/:id` - Get a single project by ID
- `POST /projects` - Create a new project
- `PATCH /projects/:id` - Partially update a project
- `PUT /projects/:id` - Replace a project completely
- `DELETE /projects/:id` - Delete a project

#### Swagger Documentation

All endpoints are automatically documented in Swagger with:

- Request/response schemas based on your DTOs
- API tags specified in `extraDecorators`
- Validation rules from class-validator decorators
- Pagination parameters for list endpoints

This pattern provides a complete, production-ready CRUD API with minimal
boilerplate code while maintaining full type safety and comprehensive
documentation.

## Explanation

### Architecture Overview

The Rockets SDK follows a modular, layered architecture designed for
enterprise applications:

```mermaid
graph TB
    subgraph AL["Application Layer"]
        direction BT
        A[Controllers]
        B[DTOs]
        C[Swagger Docs]
    end
    
    subgraph SL["Service Layer"]
        direction BT
        D[Auth Services]
        E[User Services]
        F[OTP Services]
    end
    
    subgraph IL["Integration Layer"]
        direction BT
        G[JWT Module]
        H[Email Module]
        I[Password Module]
    end
    
    subgraph DL["Data Layer"]
        direction BT      
        J[TypeORM Integration]
        L[Custom Adapters]
    end
    
    AL --> SL
    SL --> IL
    IL --> DL
```

#### Core Components

1. **RocketsServerModule**: The main module that orchestrates all other modules
2. **Authentication Layer**: Handles JWT, local auth, refresh tokens
3. **User Management**: CRUD operations, profiles, password management
4. **OTP System**: One-time password generation and validation
5. **Email Service**: Template-based email notifications
6. **Data Layer**: TypeORM integration with adapter support

### Design Decisions

#### 1. Unified Module Approach

**Decision**: Combine multiple authentication modules into a single package.

**Rationale**:

- Reduces setup complexity for developers
- Ensures compatibility between modules
- Provides a consistent configuration interface
- Eliminates version conflicts between related packages

**Trade-offs**:

- Larger bundle size if only some features are needed
- Less granular control over individual module versions

#### 2. Configuration-First Design

**Decision**: Use extensive configuration objects rather than code-based setup.

**Rationale**:

- Enables environment-specific configurations
- Supports async configuration with dependency injection
- Makes the system more declarative and predictable
- Facilitates testing with different configurations

**Example**:

```typescript
// Configuration-driven approach
RocketsServerModule.forRoot({
  jwt: { settings: { /* ... */ } },
  user: { /* ... */ },
  otp: { /* ... */ },
});

// vs. imperative approach (not used)
const jwtModule = new JwtModule(jwtConfig);
const userModule = new UserModule(userConfig);
// ... manual wiring
```

#### 3. Adapter Pattern for Data Access

**Decision**: Use repository adapters instead of direct TypeORM coupling.

**Rationale**:

- Supports multiple database types and ORMs
- Enables custom data sources (APIs, NoSQL, etc.)
- Facilitates testing with mock repositories
- Provides flexibility for future data layer changes

**Implementation**: Uses the adapter pattern with a standardized repository
interface to support multiple database types and ORMs.

#### 4. Service Injection Pattern

**Decision**: Allow custom service implementations through dependency injection.

**Rationale**:

- Enables integration with existing systems
- Supports custom business logic
- Facilitates testing with mock services
- Maintains loose coupling between components

**Example**:

```typescript
services: {
  mailerService: new CustomMailerService(),
  userModelService: new CustomUserModelService(),
  notificationService: new CustomNotificationService(),
}
```

#### 5. Global vs Local Registration

**Decision**: Support both global and local module registration.

**Rationale**:

- Global registration simplifies common use cases
- Local registration provides fine-grained control
- Supports micro-service architectures
- Enables gradual adoption in existing applications

### Core Concepts

#### 1. Testing Support

The Rockets SDK provides comprehensive testing support including:

**Unit Tests**: Individual module and service testing with mock dependencies
**Integration Tests**: End-to-end testing of complete authentication flows
**E2E Tests**: Full application testing with real HTTP requests

**Example E2E Test Structure**:

```typescript
// auth-oauth.controller.e2e-spec.ts
describe('AuthOAuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmExtModule.forRootAsync({
          useFactory: () => ormConfig,
        }),
        RocketsServerModule.forRoot({
          user: {
            imports: [
              TypeOrmExtModule.forFeature({
                user: { entity: UserFixture },
              }),
            ],
          },
          otp: {
            imports: [
              TypeOrmExtModule.forFeature({
                userOtp: { entity: UserOtpEntityFixture },
              }),
            ],
          },
          federated: {
            imports: [
              TypeOrmExtModule.forFeature({
                federated: { entity: FederatedEntityFixture },
              }),
            ],
          },
          services: {
            mailerService: mockEmailService,
          },
        }),
      ],
      controllers: [AuthOAuthController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /oauth/authorize', () => {
    it('should handle authorize with google provider', async () => {
      await request(app.getHttpServer())
        .get('/oauth/authorize?provider=google&scopes=email profile')
        .expect(200);
    });
  });

  describe('GET /oauth/callback', () => {
    it('should handle callback with google provider and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .get('/oauth/callback?provider=google')
        .expect(200);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith('test-user-id');
      expect(response.body).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });
  });
});
```

**Key Testing Features**:

- **Fixture Support**: Pre-built test entities and services
- **Mock Services**: Easy mocking of email, OTP, and authentication services
- **Database Testing**: In-memory database support for isolated tests
- **Guard Testing**: Comprehensive testing of authentication guards
- **Error Scenarios**: Testing of error conditions and edge cases

#### 2. Authentication Flow

The Rockets SDK implements a comprehensive authentication flow:

#### 1a. User Registration Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant CT as AuthSignupController
    participant PS as PasswordStorageService
    participant US as UserModelService
    participant D as Database
    
    C->>CT: POST /signup (email, username, password)
    CT->>PS: hashPassword(plainPassword)
    PS-->>CT: hashedPassword
    CT->>US: createUser(userData)
    US->>D: Save User Entity
    D-->>US: User Created
    US-->>CT: User Profile
    CT-->>C: 201 Created (User Profile)
```

**Services to customize for registration:**

- `PasswordStorageService` - Custom password hashing algorithms
- `UserModelService` - Custom user creation logic, validation, external systems integration

#### 1b. User Authentication Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant G as AuthLocalGuard
    participant ST as AuthLocalStrategy
    participant VS as AuthLocalValidateUserService
    participant US as UserModelService
    participant PV as PasswordValidationService
    participant D as Database
    
    C->>G: POST /token/password (username, password)
    G->>ST: Redirect to Strategy
    ST->>ST: Validate DTO Fields
    ST->>VS: validateUser(username, password)
    VS->>US: byUsername(username)
    US->>D: Find User by Username
    D-->>US: User Entity
    US-->>VS: User Found
    VS->>VS: isActive(user)
    VS->>PV: validate(user, password)
    PV-->>VS: Password Valid
    VS-->>ST: Validated User
    ST-->>G: Return User
    G-->>C: User Added to Request (@AuthUser)
```

**Services to customize for authentication:**

- `AuthLocalValidateUserService` - Custom credential validation logic
- `UserModelService` - Custom user lookup by username, email, or other fields
- `PasswordValidationService` - Custom password verification algorithms

#### 1c. Token Generation Flow

```mermaid
sequenceDiagram
    participant G as AuthLocalGuard
    participant CT as AuthPasswordController
    participant ITS as IssueTokenService
    participant JS as JwtService
    participant C as Client
    
    G->>CT: Request with Validated User (@AuthUser)
    CT->>ITS: responsePayload(user.id)
    ITS->>JS: signAsync(payload) - Access Token
    JS-->>ITS: Access Token
    ITS->>JS: signAsync(payload, {expiresIn: '7d'}) - Refresh Token
    JS-->>ITS: Refresh Token
    ITS-->>CT: {accessToken, refreshToken}
    CT-->>C: 200 OK (JWT Tokens)
```

**Services to customize for token generation:**

- `IssueTokenService` - Custom JWT payload, token expiration, additional claims
- `JwtService` - Custom signing algorithms, token structure

#### 1d. Protected Route Access Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant G as AuthJwtGuard
    participant ST as AuthJwtStrategy
    participant VTS as VerifyTokenService
    participant US as UserModelService
    participant D as Database
    participant CT as Controller
    
    C->>G: GET /user (Authorization: Bearer token)
    G->>ST: Redirect to JWT Strategy
    ST->>VTS: verifyToken(accessToken)
    VTS-->>ST: Token Valid & Payload
    ST->>US: bySubject(payload.sub)
    US->>D: Find User by Subject/ID
    D-->>US: User Entity
    US-->>ST: User Found
    ST-->>G: Return User
    G->>CT: Add User to Request (@AuthUser)
    CT->>D: Get Additional User Data (if needed)
    D-->>CT: User Data
    CT-->>C: 200 OK (Protected Resource)
```

**Services to customize for protected routes:**

- `VerifyTokenService` - Custom token verification logic, blacklist checking
- `UserModelService` - Custom user lookup by subject/ID, user status validation

#### 2. OTP Verification Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant OS as OTP Service
    participant D as Database
    participant E as Email Service
    
    Note over C,E: OTP Generation Flow
    C->>S: POST /otp (email)
    S->>OS: Generate OTP (RocketsServerOtpService)
    OS->>D: Store OTP with Expiry
    OS->>E: Send Email (NotificationService)
    E-->>OS: Email Sent
    S-->>C: 201 Created (OTP Sent)
    
    Note over C,E: OTP Verification Flow
    C->>S: PATCH /otp (email + passcode)
    S->>OS: Validate OTP Code
    OS->>D: Check OTP & Mark Used
    OS->>S: OTP Valid
    S->>S: Generate JWT Tokens (AuthLocalIssueTokenService)
    S-->>C: 200 OK (JWT Tokens)
```

#### 3. Token Refresh Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant G as AuthRefreshGuard
    participant ST as AuthRefreshStrategy
    participant VTS as VerifyTokenService
    participant US as UserModelService
    participant D as Database
    participant CT as RefreshController
    participant ITS as IssueTokenService
    
    Note over C,D: Token Refresh Request
    C->>G: POST /token/refresh (refreshToken in body)
    G->>ST: Redirect to Refresh Strategy
    ST->>VTS: verifyRefreshToken(refreshToken)
    VTS-->>ST: Token Valid & Payload
    ST->>US: bySubject(payload.sub)
    US->>D: Find User by Subject/ID
    D-->>US: User Entity
    US-->>ST: User Found & Active
    ST-->>G: Return User
    G->>CT: Add User to Request (@AuthUser)
    CT->>ITS: responsePayload(user.id)
    ITS-->>CT: New {accessToken, refreshToken}
    CT-->>C: 200 OK (New JWT Tokens)
```

**Services to customize for token refresh:**

- `VerifyTokenService` - Custom refresh token verification, token rotation logic
- `UserModelService` - Custom user validation, account status checking
- `IssueTokenService` - Custom new token generation, token rotation policies

#### 4. Password Recovery Flow

#### 4a. Recovery Request Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant CT as RecoveryController
    participant RS as AuthRecoveryService
    participant US as UserModelService
    participant OS as OtpService
    participant NS as NotificationService
    participant ES as EmailService
    participant D as Database
    
    C->>CT: POST /recovery/password (email)
    CT->>RS: recoverPassword(email)
    RS->>US: byEmail(email)
    US->>D: Find User by Email
    D-->>US: User Found (or null)
    US-->>RS: User Entity
    RS->>OS: create(otpConfig)
    OS->>D: Store OTP with Expiry
    D-->>OS: OTP Created
    OS-->>RS: OTP with Passcode
    RS->>NS: sendRecoverPasswordEmail(email, passcode, expiry)
    NS->>ES: sendMail(emailOptions)
    ES-->>NS: Email Sent
    RS-->>CT: Recovery Complete
    CT-->>C: 200 OK (Always success for security)
```

**Services to customize for recovery request:**

- `UserModelService` - Custom user lookup by email
- `OtpService` - Custom OTP generation, expiry logic
- `NotificationService` - Custom email templates, delivery methods
- `EmailService` - Custom email providers, formatting

#### 4b. Passcode Validation Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant CT as RecoveryController
    participant RS as AuthRecoveryService
    participant OS as OtpService
    participant D as Database
    
    C->>CT: GET /recovery/passcode/:passcode
    CT->>RS: validatePasscode(passcode)
    RS->>OS: validate(assignment, {category, passcode})
    OS->>D: Find & Validate OTP
    D-->>OS: OTP Valid & User ID
    OS-->>RS: Assignee Relation (or null)
    RS-->>CT: OTP Valid (or null)
    CT-->>C: 200 OK (Valid) / 404 (Invalid)
```

**Services to customize for passcode validation:**

- `OtpService` - Custom OTP validation, rate limiting

#### 4c. Password Update Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant CT as RecoveryController
    participant RS as AuthRecoveryService
    participant OS as OtpService
    participant US as UserModelService
    participant PS as UserPasswordService
    participant NS as NotificationService
    participant D as Database
    
    C->>CT: PATCH /recovery/password (passcode, newPassword)
    CT->>RS: updatePassword(passcode, newPassword)
    RS->>OS: validate(passcode, false)
    OS->>D: Validate OTP
    D-->>OS: OTP Valid & User ID
    OS-->>RS: Assignee Relation
    RS->>US: byId(assigneeId)
    US->>D: Find User by ID
    D-->>US: User Entity
    US-->>RS: User Found
    RS->>PS: setPassword(newPassword, userId)
    PS->>D: Update User Password
    D-->>PS: Password Updated
    RS->>NS: sendPasswordUpdatedSuccessfullyEmail(email)
    RS->>OS: clear(assignment, {category, assigneeId})
    OS->>D: Revoke All User Recovery OTPs
    RS-->>CT: User Entity (or null)
    CT-->>C: 200 OK (Success) / 400 (Invalid OTP)
```

**Services to customize for password update:**

- `OtpService` - Custom OTP validation and cleanup
- `UserModelService` - Custom user lookup validation
- `UserPasswordService` - Custom password hashing, policies
- `NotificationService` - Custom success notifications

#### 5. OAuth Flow

The Rockets SDK implements a comprehensive OAuth flow for third-party
authentication:

#### 5a. OAuth Authorization Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant AR as AuthRouterGuard
    participant AG as AuthGoogleGuard
    participant G as Google OAuth
    participant C as Client
    
    C->>AR: GET /oauth/authorize?provider=google&scopes=email profile
    AR->>AR: Route to AuthGoogleGuard
    AR->>AG: canActivate(context)
    AG->>G: Redirect to Google OAuth URL
    G-->>C: Google Login Page
    C->>G: User Authenticates
    G->>C: Redirect to /oauth/callback?code=xyz
```

**Services to customize for OAuth:**

- `AuthRouterGuard` - Custom OAuth routing logic, provider validation
- `AuthGoogleGuard` / `AuthGithubGuard` / `AuthAppleGuard` - Custom OAuth
provider integration
- `FederatedModule` - Custom user creation/lookup from OAuth data
- `UserModelService` - Custom user creation and lookup logic
- `IssueTokenService` - Custom token generation for OAuth users

---

### userCrud

User CRUD management is now provided via a dynamic submodule that you enable
through the module extras. It provides comprehensive user management including:

- User signup endpoints (`POST /signup`)
- User profile management (`GET /user`, `PATCH /user`)
- Admin user CRUD operations (`/admin/users/*`)

All endpoints are properly guarded and documented in Swagger.

#### Prerequisites

- A TypeORM repository for your user entity available via
  `TypeOrmModule.forFeature([UserEntity])`
- A CRUD adapter implementing `CrudAdapter` (e.g., a `TypeOrmCrudAdapter`)
- DTOs for model, create, update (optional replace/many)

#### Minimal adapter example

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class AdminUserTypeOrmCrudAdapter extends TypeOrmCrudAdapter<UserEntity> {
  constructor(
    @InjectRepository(UserEntity) repo: Repository<UserEntity>,
  ) {
    super(repo);
  }
}
```

#### Enable userCrud in RocketsServerModule

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    RocketsServerModule.forRootAsync({
      // ... other options
      imports: [TypeOrmModule.forFeature([UserEntity])],
      useFactory: () => ({
        services: {
          mailerService: yourMailerService,
        },
      }),
      userCrud: {
        // Ensure your repository is imported
        imports: [TypeOrmModule.forFeature([UserEntity])],
        // Route base path (default: 'admin/users')
        path: 'admin/users',
        // Swagger model type for responses
        model: YourUserDto,
        // The CRUD adapter
        adapter: AdminUserTypeOrmCrudAdapter,
        // Optional DTOs for mutations
        dto: {
          createOne: YourUserCreateDto,
          updateOne: YourUserUpdateDto,
          replaceOne: YourUserUpdateDto,
          createMany: YourUserCreateDto,
        },
      },
      
    }),
  ],
})
export class AppModule {}
```

#### Role guard behavior

- `AdminGuard` checks for the role defined in `settings.role.adminRoleName`.
- No roles are created by default. You must manually create the admin role in
  your roles store (e.g., database).
- The role name must match the environment variable `ADMIN_ROLE_NAME`
  (default is `admin`). Ensure the stored role name and env variable are
  identical.

#### Generated routes

**User Management Endpoints:**

- `POST /signup` - User registration with validation
- `GET /user` - Get current user profile (authenticated)
- `PATCH /user` - Update current user profile (authenticated)

**Admin User CRUD Endpoints:**

- `GET /admin/users` - List all users (admin only)
- `GET /admin/users/:id` - Get specific user (admin only)
- `PATCH /admin/users/:id` - Update specific user (admin only)

---

## User Management

The Rockets SDK provides comprehensive user management functionality through
automatically generated endpoints. These endpoints handle user registration,
authentication, and profile management with built-in validation and security.

### User Registration (POST /signup)

Users can register through the `/signup` endpoint with automatic validation:

```typescript
// POST /signup
{
  "username": "john_doe",
  "email": "john@example.com", 
  "password": "SecurePassword123!",
  "active": true,
  "customField": "value" // Any additional fields you've added
}
```

**Response:**

```typescript
{
  "id": "123",
  "username": "john_doe",
  "email": "john@example.com",
  "active": true,
  "dateCreated": "2024-01-01T00:00:00.000Z",
  "dateUpdated": "2024-01-01T00:00:00.000Z",
  "version": 1
  // Password fields are automatically excluded
}
```

### User Profile Management

#### Get Current User Profile (GET /user)

Authenticated users can retrieve their profile information:

```bash
GET /user
Authorization: Bearer <jwt-token>
```

**Response:**

```typescript
{
  "id": "123",
  "username": "john_doe", 
  "email": "john@example.com",
  "active": true,
  "customField": "value",
  "dateCreated": "2024-01-01T00:00:00.000Z",
  "dateUpdated": "2024-01-01T00:00:00.000Z",
  "version": 1
}
```

#### Update User Profile (PATCH /user)

Users can update their own profile information:

```typescript
// PATCH /user
// Authorization: Bearer <jwt-token>
{
  "username": "new_username",
  "email": "newemail@example.com",
  "customField": "new_value"
}
```

**Response:** Updated user object with new values

### Authentication Requirements

- **Public Endpoints:** `/signup` - No authentication required
- **Authenticated Endpoints:** `/user` (GET, PATCH) - Requires valid JWT token
- **Admin Endpoints:** `/admin/users/*` - Requires admin role

---

## DTO Validation Patterns

The Rockets SDK allows you to customize user data validation by providing your
own DTOs. This section shows common patterns for extending user functionality
with custom fields and validation rules.

### Creating Custom User DTOs

#### Custom User Response DTO

Extend the base user DTO to include additional fields in API responses:

```typescript
import { UserDto } from '@concepta/nestjs-user';
import { RocketsServerUserInterface } from '@concepta/rockets-server';
import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CustomUserDto extends UserDto implements RocketsServerUserInterface {
  @ApiProperty({
    description: 'User age',
    example: 25,
    required: false,
    type: Number,
  })
  @Expose()
  age?: number;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
  })
  @Expose()
  firstName?: string;

  @ApiProperty({
    description: 'User last name', 
    example: 'Doe',
    required: false,
  })
  @Expose()
  lastName?: string;
}
```

#### Custom User Create DTO

Add validation for user registration:

```typescript
import { PickType, IntersectionType, ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, IsString, MinLength, MaxLength } from 'class-validator';
import { UserPasswordDto } from '@concepta/nestjs-user';
import { RocketsServerUserCreatableInterface } from '@concepta/rockets-server';
import { CustomUserDto } from './custom-user.dto';

export class CustomUserCreateDto extends IntersectionType(
  PickType(CustomUserDto, ['email', 'username', 'active'] as const),
  UserPasswordDto,
) implements RocketsServerUserCreatableInterface {
  
  @ApiProperty({
    description: 'User age (must be 18 or older)',
    example: 25,
    required: false,
    minimum: 18,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Age must be a number' })
  @Min(18, { message: 'Must be at least 18 years old' })
  age?: number;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    required: false,
    minLength: 2,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters' })
  @MaxLength(50, { message: 'First name cannot exceed 50 characters' })
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
    minLength: 2,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters' })
  @MaxLength(50, { message: 'Last name cannot exceed 50 characters' })
  lastName?: string;
}
```

#### Custom User Update DTO

Define which fields can be updated:

```typescript
import { PickType, ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, Min, IsString, MinLength, MaxLength } from 'class-validator';
import { RocketsServerUserUpdatableInterface } from '@concepta/rockets-server';
import { CustomUserDto } from './custom-user.dto';

export class CustomUserUpdateDto
  extends PickType(CustomUserDto, ['id', 'username', 'email', 'active'] as const)
  implements RocketsServerUserUpdatableInterface {

  @ApiProperty({
    description: 'User age (must be 18 or older)',
    example: 25,
    required: false,
    minimum: 18,
  })
  @IsOptional()
  @IsNumber({}, { message: 'Age must be a number' })
  @Min(18, { message: 'Must be at least 18 years old' })
  age?: number;

  @ApiProperty({
    description: 'User first name',
    example: 'John', 
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;
}
```

### Using Custom DTOs

Configure your custom DTOs in the RocketsServerModule:

```typescript
@Module({
  imports: [
    RocketsServerModule.forRoot({
      userCrud: {
        imports: [TypeOrmModule.forFeature([UserEntity])],
        adapter: CustomUserTypeOrmCrudAdapter,
        model: CustomUserDto, // Your custom response DTO
        dto: {
          createOne: CustomUserCreateDto, // Custom creation validation
          updateOne: CustomUserUpdateDto, // Custom update validation
        },
      },
      // ... other configuration
    }),
  ],
})
export class AppModule {}
```

### Common Validation Patterns

#### Age Validation

```typescript
@IsOptional()
@IsNumber({}, { message: 'Age must be a number' })
@Min(18, { message: 'Must be at least 18 years old' })
@Max(120, { message: 'Must be a reasonable age' })
age?: number;
```

#### Phone Number Validation

```typescript
@IsOptional()
@IsString()
@Matches(/^\+?[1-9]\d{1,14}$/, { message: 'Invalid phone number format' })
phoneNumber?: string;
```

#### Custom Username Rules

```typescript
@IsString()
@MinLength(3, { message: 'Username must be at least 3 characters' })
@MaxLength(20, { message: 'Username cannot exceed 20 characters' })
@Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers, and underscores' })
username: string;
```

#### Array Field Validation

```typescript
@IsOptional()
@IsArray()
@IsString({ each: true })
@ArrayMaxSize(5, { message: 'Cannot have more than 5 tags' })
tags?: string[];
```

---

## Entity Customization

To support custom fields in your DTOs, you need to extend the user entity to
include the corresponding database columns. This section shows how to properly
extend the base user entity.

### Creating a Custom User Entity

Create a custom user entity that implements UserEntityInterface. If using
SQLite with TypeORM, extend UserSqliteEntity, otherwise implement the
interface directly:

```typescript
import { UserSqliteEntity } from '@concepta/nestjs-typeorm-ext';
import { Entity, Column } from 'typeorm';

@Entity('user') // Make sure to use the same table name
export class CustomUserEntity extends UserSqliteEntity {
  @Column({ type: 'integer', nullable: true })
  age?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phoneNumber?: string;

  @Column({ type: 'simple-array', nullable: true })
  tags?: string[];

  @Column({ type: 'boolean', default: false })
  isVerified?: boolean;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt?: Date;
}
```

### Creating a Custom CRUD Adapter

Create an adapter that uses your custom entity:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { CustomUserEntity } from './entities/custom-user.entity';

@Injectable()
export class CustomUserTypeOrmCrudAdapter extends TypeOrmCrudAdapter<CustomUserEntity> {
  constructor(
    @InjectRepository(CustomUserEntity) repo: Repository<CustomUserEntity>,
  ) {
    super(repo);
  }
}
```

### Registering Your Custom Entity

Update your module to use the custom entity:

```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([CustomUserEntity]), // Use your custom entity
    RocketsServerModule.forRoot({
      userCrud: {
        imports: [TypeOrmModule.forFeature([CustomUserEntity])],
        adapter: CustomUserTypeOrmCrudAdapter,
        model: CustomUserDto,
        dto: {
          createOne: CustomUserCreateDto,
          updateOne: CustomUserUpdateDto,
        },
      },
      user: {
        imports: [
          TypeOrmExtModule.forFeature({
            user: {
              entity: CustomUserEntity, // Use custom entity here too
            },
          }),
        ],
      },
      // ... other configuration
    }),
  ],
})
export class AppModule {}
```

---

## Best Practices

This section outlines recommended patterns and practices for working
effectively with the Rockets SDK.

### Development Workflow

#### 1. Project Structure Organization

Organize your Rockets SDK implementation with a clear structure:

```typescript
src/
├── modules/
│   ├── auth/
│   │   ├── entities/
│   │   │   └── custom-user.entity.ts
│   │   ├── dto/
│   │   │   ├── custom-user.dto.ts
│   │   │   ├── custom-user-create.dto.ts
│   │   │   └── custom-user-update.dto.ts
│   │   ├── adapters/
│   │   │   └── custom-user-crud.adapter.ts
│   │   └── auth.module.ts
│   └── app.module.ts
└── config/
      ├── database.config.ts
      └── rockets.config.ts

```

### DTO Design Patterns

#### 1. Interface Consistency

Always implement the appropriate interfaces:

```typescript
// ✅ Good - Implements interface
export class CustomUserDto extends UserDto implements RocketsServerUserInterface {
  @Expose()
  customField: string;
}

// ❌ Bad - Missing interface
export class CustomUserDto extends UserDto {
  @Expose()
  customField: string;
}
```

#### 2. Validation Layering

Use progressive validation patterns and ensure properties are exposed in
responses using @Expose():

```typescript
export class CustomUserCreateDto {
  // Base validation
  @IsEmail()
  @IsNotEmpty()
  @Expose()
  email: string;

  // Business rules
  @IsOptional()
  @IsNumber()
  @Min(18, { message: 'Must be 18 or older' })
  @Max(120, { message: 'Must be a reasonable age' })
  @Expose()
  age?: number;

  // Complex validation
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]+$/, { 
    message: 'Username can only contain letters, numbers, and underscores' 
  })
  @MinLength(3)
  @MaxLength(20)
  @Expose()
  username?: string;
}
```

#### 3. DTO Inheritance Patterns

Use composition over deep inheritance:

```typescript
// ✅ Good - Composition with PickType
export class UserCreateDto extends IntersectionType(
  PickType(UserDto, ['email', 'username'] as const),
  UserPasswordDto,
) {
  // Additional fields
}
```
