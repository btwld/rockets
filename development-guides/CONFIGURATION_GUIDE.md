# ⚙️ CONFIGURATION GUIDE

> **For AI Tools**: This guide contains all application setup and configuration patterns for Rockets SDK. Use this when setting up new applications or configuring rockets-server and rockets-server-auth packages.

## 📋 **Quick Reference**

| Task | Section | Time |
|------|---------|------|
| **Module Import Order** | [Module Import Order](#module-import-order) | 2 min |
| Setup main.ts application | [Application Bootstrap](#application-bootstrap) | 5 min |
| Configure rockets-server | [Rockets Server Configuration](#rockets-server-configuration) | 10 min |
| Configure rockets-server-auth | [Rockets Server Auth Configuration](#rockets-server-auth-configuration) | 15 min |
| Environment variables | [Environment Configuration](#environment-configuration) | 5 min |
| Database setup | [Database Configuration](#database-configuration) | 10 min |

---

## ⚠️ **Module Import Order**

### **Golden path (recommended): one `RocketsModule` + `defineRocketsAuth`**

Use a single `RocketsModule.forRoot` / `forRootAsync` and pass built-in auth as
`auth: defineRocketsAuth({ persistence, userMetadata, userCrud, … })` from
`@bitwild/rockets-auth`. `RocketsModule` merges auth persistence into the same
`buildAppRegistrationPlan` surface as your domain `resources[]` and, **inside
that dynamic module**, wires **`RocketsCoreModule` before** the auth
`nestImports` slice — so you do **not** manually order `RocketsAuthModule` vs
`RocketsModule` at the app root.

See [`examples/sample-server-auth/`](../examples/sample-server-auth/) and
[`development-guides/ROCKETS_AI_INDEX.md`](./ROCKETS_AI_INDEX.md) (built-in auth row).

### **Legacy: two sibling imports (`RocketsAuthModule` + `RocketsModule`)**

If you still compose `RocketsAuthModule` and `RocketsModule` as **separate**
entries in `@Module({ imports: [...] })`, Nest resolves siblings in list order.
Then **`RocketsAuthModule` must come first** so `RocketsJwtAuthAdapter` exists
before `RocketsModule.forRootAsync({ inject: [RocketsJwtAuthAdapter], … })`.

```bash
# Wrong order (legacy layout) can yield:
❌ Nest can't resolve dependencies of RocketsModule (?).
   Please make sure that the RocketsJwtAuthAdapter is available.

# Fix: RocketsAuthModule → RocketsModule (or migrate to defineRocketsAuth above)
```

---

## 🚀 **Application Bootstrap**

### **Main Application Setup (main.ts)**

The latest Rockets SDK provides built-in services for automatic application setup:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerUiService } from '@bitwild/rockets-server-auth'; // or @bitwild/rockets-server
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for development
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Global validation pipe with enhanced configuration
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
  }));

  // Swagger setup (automatic with Rockets SDK)
  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder()
    .addBearerAuth()
    .addTag('authentication', 'Authentication endpoints')
    .addTag('users', 'User management endpoints')
    .addTag('admin', 'Admin management endpoints');
  swaggerUiService.setup(app);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log('🚀 Rockets Server running on http://localhost:' + port);
  console.log('📚 API Docs available at http://localhost:' + port + '/api');
}

bootstrap().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
```

### **Key Features:**
- ✅ **Automatic Swagger Configuration**: SDK handles DocumentBuilder setup
- ✅ **JWT Configuration**: Automatic JWT strategy registration
- ✅ **Global Validation**: Enhanced validation with transformation
- ✅ **CORS Support**: Configurable cross-origin requests
- ✅ **Error Handling**: Built-in exception filters

---

## 🔧 **Rockets Server Configuration**

> **Source of truth:** [`examples/sample-server/CONFIGURATION.md`](../examples/sample-server/CONFIGURATION.md)
> and [`examples/sample-server/src/app.module.ts`](../examples/sample-server/src/app.module.ts).

### **Final shape (external auth)**

One `RocketsModule.forRoot` at the app root. No sibling `AuthModule`, no
hand-listed `TypeOrmModule.forRoot({ entities })`.

```typescript
import { Module } from '@nestjs/common';
import { RocketsModule } from '@bitwild/rockets';
import { defineSampleAuth } from './auth/define-sample-auth';
import { defineTypeOrmRepository } from './repository/define-typeorm-repository';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './dto/user-metadata.dto';
import { petResource } from './resources/pet';

@Module({
  imports: [
    RocketsModule.forRoot({
      auth: defineSampleAuth(),           // AuthFeatureBundle
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
      },
      repository: defineTypeOrmRepository({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        synchronize: false,
      }),
      resources: [petResource],
    }),
  ],
})
export class AppModule {}
```

Use `forRootAsync` + `ConfigService` when connection options come from env —
same fields.

### **Auth adapter**

Each adapter implements `AuthAdapterInterface.authenticate()` and returns a
discriminated union:

| Return value | Meaning |
|---|---|
| `{ matched: false }` | Adapter does not own this credential (try the next one) |
| `{ matched: true, user }` | Valid credential — guard stamps `req.user` and stops |
| `{ matched: true, error }` | Recognised credential but rejected — guard stops with this `HttpException` |

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@bitwild/rockets';
import { extractBearerToken } from '@bitwild/rockets';

@Injectable()
export class Auth0Adapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };  // not a Bearer request

    try {
      const decoded = await verifyWithAuth0(token); // your IdP SDK
      return {
        matched: true,
        user: {
          id: decoded.sub,
          sub: decoded.sub,
          email: decoded.email,
          userRoles: [{ role: { name: 'user' } }],
          claims: decoded,
        },
      };
    } catch {
      return { matched: true, error: new UnauthorizedException('Authentication failed') };
    }
  }
}
```

#### **Multiple adapters — chain syntax**

Pass an array to `auth` to try multiple strategies in priority order. The
guard stops on the first conclusive result (success **or** rejection). A
`matched: false` result moves to the next adapter.

```typescript
RocketsModule.forRoot({
  // Priority order: JWT first, then API-key, then mTLS
  auth: [JwtAuthAdapter, ApiKeyAuthAdapter, MtlsAuthAdapter],
  // …
});
```

Or with `defineAuthFeature` bundles (each bundle carries its own entity +
controller):

```typescript
RocketsModule.forRoot({
  auth: [jwtFeature, apiKeyFeature],
  // …
});
```

Prefer `defineAuthFeature({ adapter, entities, controllers })` so auth tables
and routes stay colocated — see `examples/sample-server/src/auth/`.

### **Repository bootstrap + `resources[]`**

- `defineResource()` — CRUD bundle; auto-contributes entity row + routes.
- `defineModuleResource()` — custom controllers/services; optional `entities[]`.
- `userMetadata.entity` — metadata row for `/me`.
- `repository` — `RepositoryModuleInterface` or `RepositoryBootstrap`
  (`defineTypeOrmRepository` in sample-server).

```typescript
RocketsModule.forRoot({
  auth: defineSampleAuth(),
  repository: defineTypeOrmRepository({ /* driver options */ }),
  userMetadata: { entity, createDto, updateDto },
  resources: [petResource, auditFeature, petTransferFeature],
});
```

**Per-entity adapter override.** Within a `defineModuleResource` bundle,
each entity entry can declare its own `repository` to escape the root
default:

```typescript
defineModuleResource({
  entities: [
    { key: 'audit', entity: AuditLogEntity }, // root adapter (TypeORM)
    {
      key: 'cache',
      entity: CacheRowEntity,
      repository: RedisRepositoryModule, // overrides root for this row
    },
  ],
  module: { providers: [CacheService], exports: [CacheService] },
});
```

**Allow-empty bundles.** A feature that only consumes already-registered
repositories (e.g. a CQRS workflow) sets `entities: []` and contributes
just the Nest slice — the registration plan still wires the
controllers/providers automatically.

---

## 🔐 **Rockets Server Auth Configuration**

### **Complete auth system setup (`RocketsModule` + `defineRocketsAuth`)**

Full built-in auth is composed through **`RocketsModule.forRoot`** with
`auth: defineRocketsAuth({ persistence, userMetadata, userCrud, useFactory, … })`.
The `useFactory` / `inject` contract matches `RocketsAuthModule.forRootAsync`
options (settings, services, roleCrud, accessControl, …); **persistence is only
on `defineRocketsAuth`**, not on `RocketsAuthModule`.

```typescript
// app.module.ts — same settings surface as before, new composition root
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { RocketsModule } from '@bitwild/rockets';
import { defineRocketsAuth } from '@bitwild/rockets-auth';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: config.get('NODE_ENV') === 'development',
      }),
    }),
    RocketsModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
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
          userMetadata: {
            entity: UserMetadataEntity,
            createDto: UserMetadataCreateDto,
            updateDto: UserMetadataUpdateDto,
          },
          inject: [ConfigService],
          useFactory: (cs: ConfigService) => ({
            settings: {
              jwt: {
                secret: cs.get('JWT_SECRET'),
                expiresIn: cs.get('JWT_EXPIRES_IN', '1h'),
              },
              authLocal: { enabled: true, usernameField: 'email', passwordField: 'password' },
              authJwt: { enabled: true, secretKey: cs.get('JWT_SECRET') },
              /* authOAuth, authRecovery, otp, email, user, userAdmin, … */
            },
            services: { mailerService: /* … */ },
          }),
          userCrud: {
            model: UserDto,
            dto: { createOne: UserCreateDto, updateOne: UserUpdateDto },
          },
        });
        return {
          repository: TypeOrmRepositoryModule,
          auth: rocketsAuth,
          userMetadata: rocketsAuth.userMetadata,
          resources: [],
        };
      },
    }),
  ],
})
export class AppModule {}
```

### **Minimal auth configuration**

```typescript
// Minimal slice — still requires persistence + userMetadata + userCrud on defineRocketsAuth
import { defineRocketsAuth } from '@bitwild/rockets-auth';
import { RocketsModule } from '@bitwild/rockets';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';

RocketsModule.forRoot({
  repository: TypeOrmRepositoryModule,
  auth: defineRocketsAuth({
    persistence: {
      module: TypeOrmRepositoryModule,
      entities: {
        user: UserEntity,
        userCredentials: UserCredentialEntity,
      },
    },
    userMetadata: { entity: UserMetadataEntity, createDto, updateDto },
    userCrud: { model: UserDto, dto: { createOne: UserCreateDto, updateOne: UserUpdateDto } },
    useFactory: () => ({
      settings: {
        authLocal: { enabled: true },
        authJwt: { enabled: true },
        user: { enabled: true },
        email: { transport: { host: 'localhost', port: 1025 } },
      },
    }),
  }),
  userMetadata: {
    entity: UserMetadataEntity,
    createDto,
    updateDto,
  },
  resources: [],
});
```

### **Complete configuration with CRUD admin (`defineRocketsAuth`)**

`defineRocketsAuth` turns the friendly `persistence.entities` map into
`defineModuleResource` rows (canonical repository keys) that register alongside
your app `resources[]`. Admin user CRUD stays CQRS-driven; admin role CRUD
still keys off the `role` row — pass `roleCrud` as today.

```typescript
// app.module.ts — built-in auth + Rockets core/server in one tree
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { RocketsModule } from '@bitwild/rockets';
import { defineRocketsAuth } from '@bitwild/rockets-auth';
import {
  UserEntity,
  UserCredentialEntity,
  UserMetadataEntity,
  UserOtpEntity,
  RoleEntity,
  UserRoleEntity,
} from './entities';
import {
  UserDto,
  UserCreateDto,
  UserUpdateDto,
  UserMetadataCreateDto,
  UserMetadataUpdateDto,
  RoleDto,
  RoleCreateDto,
  RoleUpdateDto,
} from './dto';

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
  userMetadata: {
    entity: UserMetadataEntity,
    createDto: UserMetadataCreateDto,
    updateDto: UserMetadataUpdateDto,
  },
  useFactory: () => ({
    settings: {
      /* authLocal, authJwt, email, role, otp, … */
    },
    services: { mailerService: /* … */ },
  }),
  userCrud: {
    model: UserDto,
    dto: { createOne: UserCreateDto, updateOne: UserUpdateDto },
  },
  roleCrud: {
    model: RoleDto,
    dto: { createOne: RoleCreateDto, updateOne: RoleUpdateDto },
  },
});

@Module({
  imports: [
    TypeOrmModule.forRoot({
      /* … */
      autoLoadEntities: true,
    }),
    RocketsModule.forRoot({
      repository: TypeOrmRepositoryModule,
      auth: rocketsAuth,
      userMetadata: rocketsAuth.userMetadata,
      resources: [
        /* defineResource / defineModuleResource for domain tables */
      ],
    }),
  ],
})
export class AppModule {}
```

**Key Points:**

### 📌 **TypeORM Module Usage: When to Use Which?**

#### **TypeOrmExtModule.forFeature({ ... })**

**Purpose:** Dynamic repository injection for Model Services

**When to use:**
- ✅ When you need to inject repositories into **Model Services** (e.g., `UserModelService`, `RoleModelService`)
- ✅ When using `@InjectDynamicRepository()` decorator
- ✅ **REQUIRED** by Rockets packages (rockets-server, rockets-server-auth) for their internal Model Services
- ✅ Provides enhanced repository features and dynamic token injection

**Pattern:**
```typescript
TypeOrmExtModule.forFeature({
  user: { entity: UserEntity },        // Key-based injection
  role: { entity: RoleEntity },
  pet: { entity: PetEntity },
})
```

**Usage in services:**
```typescript
@Injectable()
export class PetModelService {
  constructor(
    @InjectDynamicRepository('pet')  // Matches the key above
    private readonly repo: Repository<PetEntity>,
  ) {}
}
```

---

#### **TypeOrmModule.forFeature([...])**

**Purpose:** Standard TypeORM repository injection for CRUD operations

**When to use:**
- ✅ When you need to inject repositories into **CRUD Adapters** (e.g., `PetTypeOrmCrudAdapter`)
- ✅ When using `@InjectRepository()` decorator (standard TypeORM)
- ✅ **REQUIRED** for all CRUD operations with TypeORM adapters
- ✅ **REQUIRED** in CRUD configuration imports (userCrud, roleCrud, etc.)

**Pattern:**
```typescript
TypeOrmModule.forFeature([UserEntity, RoleEntity, PetEntity])  // Array of entities
```

**Usage in adapters:**
```typescript
@Injectable()
export class PetTypeOrmCrudAdapter {
  constructor(
    @InjectRepository(PetEntity)  // Standard TypeORM injection
    private readonly repo: Repository<PetEntity>,
  ) {}
}
```

---

#### **When You Need Both (Common Pattern)**

**For most CRUD modules, you'll use BOTH:**

```typescript
@Module({
  imports: [
    // For CRUD operations (adapters)
    TypeOrmModule.forFeature([PetEntity]),
    
    // For Model Services (model services used by Rockets)
    TypeOrmExtModule.forFeature({
      pet: { entity: PetEntity },
    }),
  ],
  providers: [
    PetTypeOrmCrudAdapter,  // Uses TypeOrmModule
    PetModelService,         // Uses TypeOrmExtModule
    PetCrudService,
  ],
})
export class PetModule {}
```

---

#### **Quick Decision Tree**

```
Are you implementing CRUD operations?
├─ YES → Use TypeOrmModule.forFeature([Entity])
│        (Required for CrudAdapter)
│
└─ Are you using Rockets Model Services?
   └─ YES → ALSO use TypeOrmExtModule.forFeature({ key: { entity: Entity } })
            (Required for ModelService injection)
```

---

#### **Common Mistakes to Avoid**

❌ **Mistake 1:** Only using `TypeOrmExtModule` for CRUD
```typescript
// WRONG - CRUD adapters need TypeOrmModule
@Module({
  imports: [
    TypeOrmExtModule.forFeature({ pet: { entity: PetEntity } }),
  ],
  providers: [PetTypeOrmCrudAdapter], // ❌ Won't work!
})
```

❌ **Mistake 2:** Forgetting `TypeOrmModule` in `userCrud` / `roleCrud` imports
```typescript
// WRONG — handlers/adapters need TypeORM metadata for your entities
userCrud: {
  model: UserDto,
  // Missing: imports: [TypeOrmModule.forFeature([UserEntity, UserMetadataEntity])]
}
```

✅ **Correct:** Include both when needed
```typescript
@Module({
  imports: [
    TypeOrmModule.forFeature([PetEntity]),      // For CRUD
    TypeOrmExtModule.forFeature({               // For Model Services
      pet: { entity: PetEntity },
    }),
  ],
})
```

---

#### **Summary**

| Module | Use For | Injection | Pattern |
|--------|---------|-----------|---------|
| `TypeOrmExtModule` | Model Services | `@InjectDynamicRepository('key')` | `{ key: { entity: Entity } }` |
| `TypeOrmModule` | CRUD Adapters | `@InjectRepository(Entity)` | `[Entity]` |

**Rule of Thumb:** If you're doing CRUD operations with Rockets → **Use both**

---

## 🗄️ **Database Configuration**

### **PostgreSQL (Recommended for Production)**

```typescript
// Database configuration with connection pooling
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    type: 'postgres',
    url: configService.get('DATABASE_URL'),
    autoLoadEntities: true,
    synchronize: configService.get('NODE_ENV') === 'development',
    logging: configService.get('NODE_ENV') === 'development',
    
    // Connection pooling
    extra: {
      max: parseInt(configService.get('DB_MAX_CONNECTIONS', '10')),
      min: parseInt(configService.get('DB_MIN_CONNECTIONS', '1')),
      acquire: parseInt(configService.get('DB_ACQUIRE_TIMEOUT', '60000')),
      idle: parseInt(configService.get('DB_IDLE_TIMEOUT', '10000')),
    },
    
    // SSL configuration for production
    ssl: configService.get('NODE_ENV') === 'production' ? {
      rejectUnauthorized: false
    } : false,
  }),
})
```

### **SQLite (Development Only)**

```typescript
// Simple SQLite for development
TypeOrmModule.forRoot({
  type: 'sqlite',
  database: 'database.sqlite',
  autoLoadEntities: true,
  synchronize: true,
  logging: true,
})
```

### **MySQL/MariaDB Alternative**

```typescript
TypeOrmModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    type: 'mysql',
    host: configService.get('DB_HOST'),
    port: parseInt(configService.get('DB_PORT', '3306')),
    username: configService.get('DB_USERNAME'),
    password: configService.get('DB_PASSWORD'),
    database: configService.get('DB_DATABASE'),
    autoLoadEntities: true,
    synchronize: configService.get('NODE_ENV') === 'development',
  }),
})
```

---

## 🌍 **Environment Configuration**

### **Complete Environment Variables**

```bash
# .env file
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/rockets_db
DB_MAX_CONNECTIONS=10
DB_MIN_CONNECTIONS=1

# Application Settings
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:3000

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
JWT_EXPIRES_IN=1h

# Email Configuration (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM="Your App <noreply@yourapp.com>"

# OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback

# External Auth (if using rockets-server only)
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret
AUTH0_PUBLIC_KEY=your-auth0-public-key

# File Storage (Optional)
S3_BUCKET=your-s3-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key

# Logging (Optional)
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info
```

### **Environment Validation**

```typescript
// config/env.validation.ts
import { plainToClass, Transform } from 'class-transformer';
import { IsString, IsNumber, IsBoolean, validateSync } from 'class-validator';

export class EnvironmentVariables {
  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  PORT: number = 3000;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  SMTP_HOST: string;

  @IsNumber()
  @Transform(({ value }) => parseInt(value))
  SMTP_PORT: number = 587;

  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  SMTP_SECURE: boolean = false;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}

// Use in app.module.ts
ConfigModule.forRoot({
  validate,
  isGlobal: true,
})
```

---

## 🔧 **Advanced Configuration Patterns**

### **Multi-Environment Setup**

```typescript
// config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
  email: {
    transport: {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
  },
});

// Use in app.module.ts
ConfigModule.forRoot({
  load: [configuration],
  isGlobal: true,
})
```

### **Custom Configuration Service**

```typescript
// config/app.config.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  get jwtSecret(): string {
    return this.configService.get('JWT_SECRET');
  }

  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL');
  }

  get emailConfig() {
    return {
      host: this.configService.get('SMTP_HOST'),
      port: parseInt(this.configService.get('SMTP_PORT', '587')),
      secure: this.configService.get('SMTP_SECURE') === 'true',
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    };
  }

  get googleOAuth() {
    return {
      clientId: this.configService.get('GOOGLE_CLIENT_ID'),
      clientSecret: this.configService.get('GOOGLE_CLIENT_SECRET'),
      callbackURL: this.configService.get('GOOGLE_CALLBACK_URL'),
    };
  }
}
```

### **Auth persistence (`defineRocketsAuth` → planner rows)**

Instead of registering each auth table twice, pass **`persistence`** on
`defineRocketsAuth`. It expands into `defineModuleResource` rows for
`RocketsModule` / `RocketsCoreModule` (same planner as domain `resources[]`).
Friendly property names (`user`, `userCredentials`, …) map to canonical
repository keys inside the helper — callers never import those constants.

```typescript
defineRocketsAuth({
  persistence: {
    module: TypeOrmRepositoryModule,
    entities: {
      user: UserEntity,
      userCredentials: UserCredentialEntity,
      userMetadata: UserMetadataEntity,
      userOtp: UserOtpEntity,
      role: RoleEntity,
      userRole: UserRoleEntity,
      federatedIdentity: FederatedEntity,
    },
  },
  invitationEntity: InvitationEntity, // optional `invitation` key
  userMetadata: { entity, createDto, updateDto },
  userCrud: { model, dto: { createOne, updateOne } },
  // …useFactory / settings / roleCrud / accessControl / …
});
```

- **`OtpModule.forFeature`** is attached to the auth resource bundle only when
  `entities.userOtp` is present.
- **`federated`** extras still supply their own imports when you enable OAuth.
- **`RocketsAuthModule` no longer accepts `repositoryPersistence`** — persistence
  is compiled at the `RocketsModule` boundary via `defineRocketsAuth`.

---

## 🐳 **Docker Configuration**

### **Docker Compose for Development**

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:password@db:5432/rockets_db
      - JWT_SECRET=your-super-secret-jwt-key
    depends_on:
      - db
      - redis
    volumes:
      - .:/app
      - /app/node_modules

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=rockets_db
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - "1025:1025"
      - "8025:8025"

volumes:
  postgres_data:
```

### **Dockerfile**

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
```

---

## ✅ **Configuration Best Practices**

### **1. Security Configuration**
```typescript
// Security headers
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));

// Rate limiting
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
}));
```

### **2. Logging Configuration**
```typescript
// Enhanced logging
const logger = new Logger('Bootstrap');
logger.log(`🚀 Application running on port ${port}`);
logger.log(`📚 API Documentation: http://localhost:${port}/api`);
logger.log(`🗄️ Database: ${configService.get('NODE_ENV')}`);
```

### **3. Graceful Shutdown**
```typescript
// main.ts
process.on('SIGTERM', async () => {
  logger.log('SIGTERM received, shutting down gracefully');
  await app.close();
  process.exit(0);
});
```

---

## 🎯 **Configuration Checklist**

### **✅ Essential Configuration**
- [ ] Environment variables configured
- [ ] Database connection working
- [ ] JWT secret set (minimum 32 characters)
- [ ] Email transport configured
- [ ] Swagger documentation accessible
- [ ] CORS configured for frontend

### **✅ Production Ready**
- [ ] SSL/TLS enabled
- [ ] Database connection pooling
- [ ] Environment validation
- [ ] Logging configured
- [ ] Error monitoring (Sentry)
- [ ] Rate limiting enabled
- [ ] Security headers applied

### **✅ Optional Features**
- [ ] OAuth providers configured
- [ ] File storage (S3) configured
- [ ] Redis caching enabled
- [ ] Email templates customized
- [ ] Admin panel enabled

---

## 🚀 **Next Steps**

After completing configuration:

1. **📖 Read [CRUD_PATTERNS_GUIDE.md](./CRUD_PATTERNS_GUIDE.md)** - Implement business modules
2. **📖 Read [ACCESS_CONTROL_GUIDE.md](./ACCESS_CONTROL_GUIDE.md)** - Configure security
3. **📖 Read [AI_TEMPLATES_GUIDE.md](./AI_TEMPLATES_GUIDE.md)** - Generate modules

**⚡ Your Rockets application is now configured and ready for development!**