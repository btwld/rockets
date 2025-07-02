# Rockets SDK Documentation

## Project

[![NPM Latest](https://img.shields.io/npm/v/@bitwild/rockets-server)](https://www.npmjs.com/package/@bitwild/rockets-server)
[![NPM Downloads](https://img.shields.io/npm/dw/@bitwild/rockets-server)](https://www.npmjs.com/package/@bitwild/rockets-server)
[![GH Last Commit](https://img.shields.io/github/last-commit/conceptadev/rockets?logo=github)](https://github.com/conceptadev/rockets)
[![GH Contrib](https://img.shields.io/github/contributors/conceptadev/rockets?logo=github)](https://github.com/conceptadev/rockets/graphs/contributors)
[![NestJS Dep](https://img.shields.io/github/package-json/dependency-version/conceptadev/rockets/@nestjs/common?label=NestJS&logo=nestjs&filename=packages%2Fnestjs-core%2Fpackage.json)](https://www.npmjs.com/package/@nestjs/common)

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
  - [user](#user)
  - [password](#password)
  - [otp](#otp)
  - [email](#email)
  - [services](#services)
  - [Environment-based Configuration](#environment-based-configuration)
- [Explanation](#explanation)
  - [Architecture Overview](#architecture-overview)
  - [Design Decisions](#design-decisions)
  - [Core Concepts](#core-concepts)
  - [Integration Patterns](#integration-patterns)

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
- **👥 User Management**: Full CRUD operations, profile management, and
  password history
- **📱 OTP Support**: One-time password generation and validation for secure
  authentication
- **📧 Email Notifications**: Built-in email service with template support
- **📚 API Documentation**: Automatic Swagger/OpenAPI documentation generation
- **🔧 Highly Configurable**: Extensive configuration options for all modules
- **🏗️ Modular Architecture**: Use only what you need, extend what you want
- **🛡️ Type Safety**: Full TypeScript support with comprehensive interfaces
- **🧪 Testing Support**: Complete testing utilities and fixtures
- **🔌 Adapter Pattern**: Support for multiple database adapters

### Installation

Install the Rockets SDK and its peer dependencies:

```bash
npm install @bitwild/rockets-server @concepta/nestjs-typeorm-ext typeorm
```

**Note**: We use SQLite for the examples as it requires no additional setup.
For production, you can easily switch to PostgreSQL, MySQL, or other databases.
If you want to use SQLite in development, also install: `npm install sqlite3`

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

@Entity()
export class UserEntity extends UserSqliteEntity {
  @OneToMany(() => UserOtpEntity, (userOtp) => userOtp.assignee)
  userOtps?: UserOtpEntity[];
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

#### Step 2: Configure Your Module

Create your main application module with the Rockets SDK:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { RocketsServerModule } from '@bitwild/rockets-server';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { UserEntity } from './entities/user.entity';
import { UserOtpEntity } from './entities/user-otp.entity';

@Module({
  imports: [
    // Database configuration - SQLite in-memory for easy testing
    TypeOrmExtModule.forRoot({
      type: 'sqlite',
      database: ':memory:', // In-memory database - no files created
      synchronize: true,    // Auto-create tables (dev only)
      autoLoadEntities: true,
      logging: false,       // Set to true to see SQL queries
    }),
    
    // Rockets SDK configuration
    RocketsServerModule.forRoot({
      // JWT configuration
      jwt: {
        settings: {
          default: { 
            secret: 'your-default-secret-key-here',
            signOptions: { expiresIn: '1h' }
          },
        },
      },
      
      // User module with entity configuration
      user: {
        imports: [
          TypeOrmExtModule.forFeature({
            user: { entity: UserEntity },
          }),
        ],
      },
      
      // OTP module with entity configuration
      otp: {
        imports: [
          TypeOrmExtModule.forFeature({
            userOtp: { entity: UserOtpEntity },
          }),
        ],
      },
      
      // Required services
      services: {
        mailerService: {
          sendMail: (options) => {
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
          type: 'uuid',
          expiresIn: '1h',
        },
      },
    }),
  ],
})
export class AppModule {}
```

#### Step 3: Create Your Main Application

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
    .setTitle('Rockets API')
    .setDescription('API built with Rockets SDK')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  
  await app.listen(3000);
  console.log('🚀 Application is running on: http://localhost:3000');
  console.log('📚 API Documentation: http://localhost:3000/api');
  console.log('💾 Using SQLite in-memory database (data resets on restart)');
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

#### User Management Endpoints

- `GET /user` - Get current user profile
- `PATCH /user` - Update current user profile

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
    "password": "SecurePass123!",
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
    "password": "SecurePass123!"
  }'
```

Expected response (200 OK):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Note**: The login endpoint returns a 200 OK status (not 201 Created) as it's retrieving
tokens, not creating a new resource.

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

🎉 **Congratulations!** You now have a fully functional authentication system
with user management, JWT tokens, and API documentation running entirely
in-memory.

**💡 Pro Tip**: Since we're using an in-memory database, all data is lost when
you restart the application. This is perfect for testing and development!

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
  authentication?: AuthenticationOptionsInterface;
  jwt?: JwtOptions;
  authJwt?: AuthJwtOptionsInterface;
  authLocal?: AuthLocalOptionsInterface;
  authRecovery?: AuthRecoveryOptionsInterface;
  refresh?: AuthRefreshOptions;
  authVerify?: AuthVerifyOptionsInterface;
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

**What it does**: Global settings that affect multiple modules, including email
configuration and OTP settings.

**Core modules it connects to**: EmailModule, OtpModule, AuthRecoveryModule,
AuthVerifyModule

**When to update**: Always required for production. The defaults use placeholder
values that won't work in real applications.

**Real-world example**: Setting up email configuration for a SaaS application
with custom branding:

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
verification and validation services.

**Core modules it connects to**: AuthenticationModule (the base authentication
system)

**When to update**: When you need to customize core authentication behavior or
provide custom token services.

**Real-world example**: Integrating with an external authentication service:

```typescript
authentication: {
  settings: {
    enableGuards: true, // Enable automatic route protection
  },
  verifyTokenService: new CustomTokenVerificationService(),
  issueTokenService: new CustomTokenIssuanceService(),
  validateTokenService: new CustomTokenValidationService(),
}
```

---

### jwt

**What it does**: JWT token configuration including secrets, expiration times,
and token services.

**Core modules it connects to**: JwtModule, AuthJwtModule, AuthRefreshModule

**When to update**: Always required for production. You must provide secure
secrets and appropriate expiration times.

**Real-world example**: Production JWT configuration with environment-based
secrets:

```typescript
jwt: {
  settings: {
    default: {
      secret: process.env.JWT_DEFAULT_SECRET, // Fallback secret
      signOptions: {
        expiresIn: '1h',
        issuer: 'mycompany.com',
        audience: 'mycompany-api',
      },
    },
    access: {
      secret: process.env.JWT_ACCESS_SECRET, // Short-lived tokens
      signOptions: {
        expiresIn: '15m',
        issuer: 'mycompany.com',
        audience: 'mycompany-api',
      },
    },
    refresh: {
      secret: process.env.JWT_REFRESH_SECRET, // Long-lived tokens
      signOptions: {
        expiresIn: '30d', // Longer for mobile apps
        issuer: 'mycompany.com',
        audience: 'mycompany-refresh',
      },
    },
  },
  jwtIssueTokenService: new CustomJwtIssueService(),
  jwtVerifyTokenService: new CustomJwtVerifyService(),
}
```

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
  appGuard: true, // Apply JWT guard globally
  verifyTokenService: new CustomJwtVerifyService(),
  userModelService: new CustomUserLookupService(),
}
```

---

### authLocal

**What it does**: Local authentication (username/password) configuration and
validation services.

**Core modules it connects to**: AuthLocalModule, handles login endpoint and
credential validation

**When to update**: When you need custom password validation, user lookup logic,
or want to integrate with external authentication systems.

**Real-world example**: Integration with LDAP for enterprise authentication:

```typescript
authLocal: {
  settings: {
    usernameField: 'email', // Use email instead of username
    passwordField: 'password',
  },
  validateUserService: new LdapUserValidationService(),
  passwordValidationService: new CustomPasswordValidationService(),
  issueTokenService: new CustomTokenIssuanceService(),
  userModelService: new LdapUserModelService(),
}
```

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
    minPasswordStrength: PasswordStrengthEnum.Strong, // Require strong passwords
    maxPasswordAttempts: 5, // Lock account after 5 failed attempts
    requireCurrentToUpdate: true, // Require current password to change
    passwordHistory: 12, // Remember last 12 passwords
    minPasswordLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    passwordExpirationDays: 90, // Force password change every 90 days
  },
}
```

---

### otp

**What it does**: One-time password configuration for the OTP system.

**Core modules it connects to**: OtpModule, provides OTP generation and
validation

**When to update**: When you need custom OTP behavior, different OTP types, or
want to integrate with external OTP services.

**Real-world example**: High-security OTP configuration for financial
applications:

```typescript
otp: {
  imports: [
    TypeOrmExtModule.forFeature({
      userOtp: { entity: UserOtpEntity },
    }),
  ],
  settings: {
    assignment: 'userOtp',
    category: 'financial-transaction',
    type: 'numeric', // 6-digit numeric codes
    expiresIn: '5m', // Short expiry for security
    length: 8, // 8-digit codes for higher security
    maxAttempts: 3, // Maximum validation attempts
    cooldownPeriod: '1m', // Cooldown between OTP requests
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

**Real-world example**: Integration with SendGrid for transactional emails:

```typescript
email: {
  mailerService: new SendGridMailerService({
    apiKey: process.env.SENDGRID_API_KEY,
    defaultFrom: 'noreply@mycompany.com',
    templates: {
      welcome: 'd-1234567890abcdef',
      passwordReset: 'd-abcdef1234567890',
      verification: 'd-567890abcdef1234',
    },
  }),
  settings: {
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 10000,
  },
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

**Real-world example**: Integration with Active Directory:

```typescript
services: {
  userModelService: new ActiveDirectoryUserModelService({
    ldapUrl: 'ldap://company.local',
    baseDN: 'DC=company,DC=local',
    bindDN: process.env.AD_BIND_DN,
    bindPassword: process.env.AD_BIND_PASSWORD,
    userSearchBase: 'OU=Users,DC=company,DC=local',
    userSearchFilter: '(sAMAccountName={{username}})',
  }),
}
```

**Real-world example 2**: Multi-tenant SaaS with complex relationships:

```typescript
// services/multi-tenant-user-model.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { 
  ReferenceIdInterface, 
  ReferenceSubject,
  UserEntityInterface 
} from '@concepta/nestjs-common';
import { RocketsServerUserModelServiceInterface } from '@concepta/rockets-sdk';
import { UserEntity } from '../entities/user.entity';

@Injectable()
export class MultiTenantUserModelService implements RocketsServerUserModelServiceInterface {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Find user by subject with all relationships for authorization context
   */
  async bySubject(subject: ReferenceSubject): Promise<ReferenceIdInterface> {
    return this.loadUserWithRelations({ subject });
  }

  async byEmail(email: string): Promise<ReferenceIdInterface> {
    return this.loadUserWithRelations({ email });
  }

  async byUsername(username: string): Promise<ReferenceIdInterface> {
    return this.loadUserWithRelations({ username });
  }

  async byId(id: string): Promise<ReferenceIdInterface> {
    return this.loadUserWithRelations({ id });
  }

  async create(user: Partial<UserEntityInterface>): Promise<ReferenceIdInterface> {
    const newUser = this.userRepository.create(user);
    const savedUser = await this.userRepository.save(newUser);
    return this.byId(savedUser.id);
  }

  async update(user: Partial<UserEntityInterface>): Promise<ReferenceIdInterface> {
    await this.userRepository.update(user.id, user);
    return this.byId(user.id);
  }

  async replace(user: UserEntityInterface): Promise<ReferenceIdInterface> {
    await this.userRepository.save(user);
    return this.byId(user.id);
  }

  async remove(user: UserEntityInterface): Promise<ReferenceIdInterface> {
    const result = await this.userRepository.remove(user);
    return result;
  }

  private async loadUserWithRelations(criteria: any): Promise<ReferenceIdInterface> {
    const user = await this.userRepository.findOne({
      where: criteria,
      relations: ['tenant', 'roles', 'teams', 'projects', 'profile'],
      select: {
        id: true,
        email: true,
        username: true,
        active: true,
        tenant: { id: true, name: true, subscriptionTier: true },
        roles: { id: true, name: true },
        teams: { id: true, name: true },
        projects: { id: true, name: true },
        profile: { firstName: true, lastName: true }
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Add computed properties for authorization
    return {
      ...user,
      // Flatten for easy access in guards/decorators
      tenantId: user.tenant?.id,
      subscriptionTier: user.tenant?.subscriptionTier,
      roleNames: user.roles?.map(r => r.name) || [],
      accessibleProjectIds: user.projects?.map(p => p.id) || [],
    };
  }
}
```

#### services.notificationService

**What it does**: Handles sending notifications for recovery and verification
processes.

**Core modules it connects to**: AuthRecoveryModule, AuthVerifyModule

**When to update**: When you need custom notification channels (SMS, push
notifications) or integration with external notification services.

**Real-world example**: Multi-channel notification service:

```typescript
services: {
  notificationService: new MultiChannelNotificationService({
    email: new SendGridEmailService(),
    sms: new TwilioSmsService(),
    push: new FirebasePushService(),
    channels: {
      passwordRecovery: ['email', 'sms'],
      accountVerification: ['email'],
      securityAlert: ['email', 'sms', 'push'],
    },
  }),
}
```

#### services.verifyTokenService

**What it does**: Verifies JWT tokens for authentication.

**Core modules it connects to**: AuthenticationModule, JwtModule

**When to update**: When you need custom token verification logic or integration
with external token validation services.

**Real-world example**: Integration with OAuth2 provider:

```typescript
services: {
  verifyTokenService: new OAuth2TokenVerifyService({
    introspectionEndpoint: 'https://auth.provider.com/oauth2/introspect',
    clientId: process.env.OAUTH2_CLIENT_ID,
    clientSecret: process.env.OAUTH2_CLIENT_SECRET,
    cacheTokens: true,
    cacheTtl: 300, // 5 minutes
  }),
}
```

#### services.issueTokenService

**What it does**: Issues JWT tokens for authenticated users.

**Core modules it connects to**: AuthenticationModule, AuthLocalModule,
AuthRefreshModule

**When to update**: When you need custom token issuance logic or want to include
additional claims.

**Real-world example**: Custom token with user roles and permissions:

```typescript
services: {
  issueTokenService: new CustomTokenIssueService({
    includeUserRoles: true,
    includePermissions: true,
    customClaims: {
      tenantId: (user) => user.tenantId,
      department: (user) => user.department,
      lastLogin: (user) => user.lastLoginAt,
    },
    tokenAudience: 'mycompany-api',
    tokenIssuer: 'mycompany-auth',
  }),
}
```

#### services.validateTokenService

**What it does**: Validates token structure and claims.

**Core modules it connects to**: AuthenticationModule

**When to update**: When you need custom token validation rules or security
checks.

**Real-world example**: Enhanced security validation:

```typescript
services: {
  validateTokenService: new SecurityEnhancedTokenValidateService({
    checkTokenBlacklist: true,
    validateIpAddress: true,
    checkUserAgent: true,
    requireSecureClaims: ['tenantId', 'roles'],
    maxTokenAge: '24h',
    allowedIssuers: ['mycompany-auth'],
    allowedAudiences: ['mycompany-api'],
  }),
}
```

#### services.validateUserService

**What it does**: Validates user credentials during local authentication.

**Core modules it connects to**: AuthLocalModule

**When to update**: When you need custom credential validation or integration
with external authentication systems.

**Real-world example**: Multi-factor authentication validation:

```typescript
services: {
  validateUserService: new MfaValidateUserService({
    requireMfa: true,
    mfaProviders: ['totp', 'sms', 'email'],
    fallbackToPassword: false,
    maxLoginAttempts: 3,
    lockoutDuration: '15m',
    auditFailedAttempts: true,
  }),
}
```

#### services.userPasswordService

**What it does**: Handles password operations including hashing and validation.

**Core modules it connects to**: UserModule, AuthRecoveryModule

**When to update**: When you need custom password hashing algorithms or password
policy enforcement.

**Real-world example**: Enterprise-grade password service:

```typescript
services: {
  userPasswordService: new EnterprisePasswordService({
    hashingAlgorithm: 'argon2id',
    saltRounds: 12,
    memoryLimit: 65536, // 64MB
    timeCost: 3,
    parallelism: 4,
    enforcePasswordPolicy: true,
    checkBreachedPasswords: true,
    breachCheckService: new HaveIBeenPwnedService(),
  }),
}
```

#### services.userPasswordHistoryService

**What it does**: Manages password history to prevent password reuse.

**Core modules it connects to**: UserModule

**When to update**: When you need to enforce password history policies or custom
password tracking.

**Real-world example**: Compliance-focused password history:

```typescript
services: {
  userPasswordHistoryService: new CompliancePasswordHistoryService({
    historyLength: 24, // Remember last 24 passwords
    enforceHistory: true,
    auditPasswordChanges: true,
    encryptStoredHashes: true,
    complianceReporting: true,
    retentionPeriod: '7y', // Keep history for 7 years
  }),
}
```

#### services.userAccessQueryService

**What it does**: Handles access control and permission queries.

**Core modules it connects to**: UserModule

**When to update**: When you need custom access control logic or integration
with external authorization systems.

**Real-world example**: Role-based access control with hierarchical permissions:

```typescript
services: {
  userAccessQueryService: new HierarchicalAccessControlService({
    roleHierarchy: {
      'super-admin': ['admin', 'manager', 'user'],
      'admin': ['manager', 'user'],
      'manager': ['user'],
      'user': [],
    },
    permissionInheritance: true,
    cachePermissions: true,
    cacheTtl: 300, // 5 minutes
    auditAccessChecks: true,
  }),
}
```

#### services.mailerService (Required)

**What it does**: Core email sending service used throughout the system.

**Core modules it connects to**: EmailModule, AuthRecoveryModule,
AuthVerifyModule, OTP system

**When to update**: Always required. You must provide a working email service
for production.

**Real-world example**: Production email service with multiple providers and
failover:

```typescript
services: {
  mailerService: new FailoverMailerService({
    primary: new SendGridMailerService({
      apiKey: process.env.SENDGRID_API_KEY,
      defaultFrom: 'noreply@mycompany.com',
    }),
    fallback: new SesMailerService({
      region: 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      defaultFrom: 'backup@mycompany.com',
    }),
    retryAttempts: 3,
    retryDelay: 2000,
    healthCheck: true,
    healthCheckInterval: 60000, // 1 minute
  }),
}
```

### Usage in Module Configuration

These services are used in your module configuration like this:

```typescript
// app.module.ts
RocketsServerModule.forRoot({
  // ... other configuration
  services: {
    userModelService: new CustomUserModelService(userRepository),
    notificationService: new CustomNotificationService(emailService),
    verifyTokenService: new CustomVerifyTokenService(jwtService),
    issueTokenService: new CustomIssueTokenService(jwtService),
    validateTokenService: new CustomValidateTokenService(),
    validateUserService: new CustomValidateUserService(userRepository, passwordService),
    userPasswordService: new CustomUserPasswordService(userRepository, passwordService),
    userPasswordHistoryService: new CustomUserPasswordHistoryService(historyRepository),
    userAccessQueryService: new CustomUserAccessQueryService(userRepository, userRoleRepository),
    mailerService: new CustomMailerService(), // Required
  },
}),
```

### Implementation Notes

1. **Required Services**: Only `mailerService` is required. All other services
   have default implementations.

2. **Interface Compliance**: Each service must implement its respective
   interface exactly as defined.

3. **Dependency Injection**: Services can be injected with dependencies using
   NestJS's dependency injection system.

4. **Error Handling**: Implement proper error handling and logging in
   production services.

5. **Testing**: Each service should be thoroughly tested with unit tests and
   integration tests.

6. **Configuration**: Use environment variables and configuration services for
   production deployments.

These implementations serve as the foundation for the custom service examples
used throughout the How-to Guides section.

---

### Environment-based Configuration

For production applications, use environment variables and configuration services:

```typescript
// config/rockets.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('rockets', () => ({
  jwt: {
    access: {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    },
    refresh: {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
    },
    default: {
      secret: process.env.JWT_DEFAULT_SECRET,
      expiresIn: process.env.JWT_DEFAULT_EXPIRES || '1h',
    },
  },
  email: {
    from: process.env.EMAIL_FROM || 'noreply@example.com',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },
  otp: {
    expiresIn: process.env.OTP_EXPIRES_IN || '10m',
    type: process.env.OTP_TYPE || 'numeric',
  },
  password: {
    minStrength: parseInt(process.env.PASSWORD_MIN_STRENGTH) || 2,
    maxAttempts: parseInt(process.env.PASSWORD_MAX_ATTEMPTS) || 5,
  },
}));

// app.module.ts
RocketsServerModule.forRootAsync({
  imports: [ConfigModule.forFeature(rocketsConfig)],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    jwt: {
      settings: configService.get('rockets.jwt'),
    },
    settings: {
      email: configService.get('rockets.email'),
      otp: {
        assignment: 'userOtp',
        category: 'auth-login',
        ...configService.get('rockets.otp'),
      },
    },
    password: {
      settings: configService.get('rockets.password'),
    },
    services: {
      mailerService: new ProductionMailerService(),
    },
    // ... other configuration
  }),
}),
```

This comprehensive configuration system allows you to customize every aspect of
the Rockets SDK while maintaining sensible defaults for rapid development.

---

## Explanation

### Architecture Overview

The Rockets SDK follows a modular, layered architecture designed for
enterprise applications:

```text
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │ Controllers │ │    DTOs     │ │    Swagger Docs         │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                     Service Layer                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │    Auth     │ │    User     │ │         OTP             │ │
│  │  Services   │ │  Services   │ │       Services          │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                   Integration Layer                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │    JWT      │ │   Email     │ │      Password           │ │
│  │   Module    │ │   Module    │ │       Module            │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer                               │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │  TypeORM    │ │   SQLite    │ │      Adapters           │ │
│  │ Integration │ │   Entities  │ │     (Custom DBs)        │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
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

**Implementation**:

```typescript
import { PlainLiteralObject } from '@nestjs/common';

import { DeepPartial } from '../../utils/deep-partial';

import { RepositoryInternals } from './repository-internals';

export interface RepositoryInterface<Entity extends PlainLiteralObject> {
  entityName(): string;

  find(
    options?: RepositoryInternals.FindManyOptions<Entity>,
  ): Promise<Entity[]>;

  findOne(
    options: RepositoryInternals.FindOneOptions<Entity>,
  ): Promise<Entity | null>;

  create(entityLike: DeepPartial<Entity>): Entity;

  merge(mergeIntoEntity: Entity, ...entityLikes: DeepPartial<Entity>[]): Entity;

  save<T extends DeepPartial<Entity>>(
    entities: T[],
    options?: RepositoryInternals.SaveOptions,
  ): Promise<(T & Entity)[]>;
  save<T extends DeepPartial<Entity>>(
    entity: T,
    options?: RepositoryInternals.SaveOptions,
  ): Promise<T & Entity>;

  remove(entities: Entity[]): Promise<Entity[]>;
  remove(entity: Entity): Promise<Entity>;

  gt<T>(value: T): any;
  gte<T>(value: T): any;
  lt<T>(value: T): any;
  lte<T>(value: T): any;
}
```

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

#### 1. Authentication Flow

The Rockets SDK implements a comprehensive authentication flow:

```┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Server    │    │  Database   │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       │ POST /signup     │                  │
       ├─────────────────►│                  │
       │                  │ Create User      │
       │                  ├─────────────────►│
       │                  │                  │
       │                  │ Hash Password    │
       │                  │ Store User       │
       │                  │◄─────────────────┤
       │ User Created     │                  │
       │◄─────────────────┤                  │
       │                  │                  │
       │ POST /token/password                │
       ├─────────────────►│                  │
       │                  │ Validate User    │
       │                  ├─────────────────►│
       │                  │ User Found       │
       │                  │◄─────────────────┤
       │                  │                  │
       │                  │ Verify Password  │
       │                  │ Generate Tokens  │
       │ JWT Tokens       │                  │
       │◄─────────────────┤                  │
       │                  │                  │
       │ GET /user        │                  │
       │ (with JWT)       │                  │
       ├─────────────────►│                  │
       │                  │ Verify JWT       │
       │                  │ Get User Data    │
       │                  ├─────────────────►│
       │                  │ User Data        │
       │                  │◄─────────────────┤
       │ User Profile     │                  │
       │◄─────────────────┤                  │
```

#### 2. OTP Verification Flow

```text
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client    │    │   Server    │    │    Email    │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │                  │
       │ POST /otp        │                  │
       ├─────────────────►│                  │
       │                  │ Generate OTP     │
       │                  │ Store in DB      │
       │                  │                  │
       │                  │ Send Email       │
       │                  ├─────────────────►│
       │ OTP Sent (201)   │                  │
       │◄─────────────────┤                  │
       │                  │                  │
       │ PATCH /otp       │                  │
       │ (with code)      │                  │
       ├─────────────────►│                  │
       │                  │ Validate OTP     │
       │                  │ Check Expiry     │
       │                  │ Mark as Used     │
       │ Tokens (200)     │                  │
       │◄─────────────────┤                  │
```

#### 3. Token Refresh Flow

```text
┌─────────────┐    ┌─────────────┐
│   Client    │    │   Server    │
└─────────────┘    └─────────────┘
       │                  │
       │ API Request      │
       │ (expired token)  │
       ├─────────────────►│
       │ 401 Unauthorized │
       │◄─────────────────┤
       │                  │
       │ POST /token/refresh
       │ (refresh token)  │
       ├─────────────────►│
       │                  │ Verify Refresh Token
       │                  │ Generate New Tokens
       │ New JWT Tokens   │
       │◄─────────────────┤
       │                  │
       │ Retry API Request│
       │ (new token)      │
       ├─────────────────►│
       │ Success Response │
       │◄─────────────────┤
```

### Integration Patterns

#### 1. Microservices Integration

For microservices architectures, use local registration:

```typescript
// auth-service/app.module.ts
@Module({
  imports: [
    RocketsServerModule.forRoot({
      global: false, // Local registration
      // Only authentication-related configuration
      jwt: { /* ... */ },
      authLocal: { /* ... */ },
      authRefresh: { /* ... */ },
    }),
  ],
})
export class AuthServiceModule {}

// user-service/app.module.ts
@Module({
  imports: [
    RocketsServerModule.forRoot({
      global: false,
      // Only user-related configuration
      user: { /* ... */ },
      password: { /* ... */ },
    }),
  ],
})
export class UserServiceModule {}
```

#### 2. Legacy System Integration

Integrate with existing user systems:

```typescript
// services/legacy-user.service.ts
@Injectable()
export class LegacyUserService implements RocketsServerUserModelServiceInterface {
  constructor(private legacyApiClient: LegacyApiClient) {}
  
  async bySubject(subject: ReferenceSubject): Promise<ReferenceIdInterface> {
    // Call legacy API
    const legacyUser = await this.legacyApiClient.getUser(subject);
    
    // Transform to Rockets format
    return {
      id: legacyUser.userId,
      email: legacyUser.emailAddress,
      username: legacyUser.loginName,
      // ... other mappings
    };
  }
}

// Module configuration
services: {
  userModelService: new LegacyUserService(legacyApiClient),
}
```

#### 3. Multi-Tenant Integration

Support multiple tenants:

```typescript
// services/multi-tenant-user.service.ts
@Injectable()
export class MultiTenantUserModelService implements RocketsServerUserModelServiceInterface {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  /**
   * Find user by subject with all relationships for authorization context
   */
  async bySubject(subject: ReferenceSubject): Promise<ReferenceIdInterface> {
    return this.loadUserWithRelations({ subject });
  }

  async byEmail(email: string): Promise<ReferenceIdInterface> {
    return this.loadUserWithRelations({ email });
  }

  async byUsername(username: string): Promise<ReferenceIdInterface> {
    return this.loadUserWithRelations({ username });
  }

  async byId(id: string): Promise<ReferenceIdInterface> {
    return this.loadUserWithRelations({ id });
  }

  async create(user: Partial<UserEntityInterface>): Promise<ReferenceIdInterface> {
    const newUser = this.userRepository.create(user);
    const savedUser = await this.userRepository.save(newUser);
    return this.byId(savedUser.id);
  }

  async update(user: Partial<UserEntityInterface>): Promise<ReferenceIdInterface> {
    await this.userRepository.update(user.id, user);
    return this.byId(user.id);
  }

  async replace(user: UserEntityInterface): Promise<ReferenceIdInterface> {
    await this.userRepository.save(user);
    return this.byId(user.id);
  }

  async remove(user: UserEntityInterface): Promise<ReferenceIdInterface> {
    const result = await this.userRepository.remove(user);
    return result;
  }

  private async loadUserWithRelations(criteria: any): Promise<ReferenceIdInterface> {
    const user = await this.userRepository.findOne({
      where: criteria,
      relations: ['tenant', 'roles', 'teams', 'projects', 'profile'],
      select: {
        id: true,
        email: true,
        username: true,
        active: true,
        tenant: { id: true, name: true, subscriptionTier: true },
        roles: { id: true, name: true },
        teams: { id: true, name: true },
        projects: { id: true, name: true },
        profile: { firstName: true, lastName: true }
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Add computed properties for authorization
    return {
      ...user,
      // Flatten for easy access in guards/decorators
      tenantId: user.tenant?.id,
      subscriptionTier: user.tenant?.subscriptionTier,
      roleNames: user.roles?.map(r => r.name) || [],
      accessibleProjectIds: user.projects?.map(p => p.id) || [],
    };
  }
}
```

#### 4. Event-Driven Integration

Integrate with event systems:

```typescript
// services/event-driven-notification.service.ts
@Injectable()
export class EventDrivenNotificationService 
  implements RocketsServerNotificationServiceInterface {
  
  constructor(private eventBus: EventBus) {}
  
  async sendNotification(type: string, recipient: string, data: any): Promise<void> {
    // Emit event instead of sending directly
    this.eventBus.emit('notification.requested', {
      type,
      recipient,
      data,
      timestamp: new Date(),
    });
  }
}

// Event handler
@EventHandler('notification.requested')
export class NotificationHandler {
  async handle(event: NotificationRequestedEvent): Promise<void> {
    // Process notification asynchronously
    await this.processNotification(event);
  }
}
```

This comprehensive documentation provides developers with everything they need
to understand, implement, and extend the Rockets SDK in their applications.
The modular design and extensive configuration options make it suitable for
projects ranging from simple prototypes to complex enterprise systems.
