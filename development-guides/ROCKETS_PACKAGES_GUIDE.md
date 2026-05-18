# 🚀 ROCKETS PACKAGES GUIDE

> **For AI Tools**: This guide covers the complete workflow for setting up projects with Rockets SDK and generating standardized modules. Use this for project initialization and module development patterns.

## 📋 **Quick Reference**

| Task | Section | Time |
|------|---------|------|
| Choose the right package | [Package Decision Matrix](#package-decision-matrix) | 2 min |
| Setup new project | [Project Foundation Setup](#project-foundation-setup) | 10 min |
| Generate business modules | [Module Generation Workflow](#module-generation-workflow) | 5 min/module |
| Integration patterns | [Integration Examples](#integration-examples) | 5 min |

---

## 📊 **Package Decision Matrix**

### **Choose Your Rockets Package:**

| Your Need | Package | When to Use |
|-----------|---------|-------------|
| **Infrastructure only** (no `/me`, no global guard) | `@bitwild/rockets-core` | Minimum footprint — build your own auth & endpoints on top |
| **External Auth System** (Auth0, Firebase, Cognito) | `@bitwild/rockets` (rockets-server) | You have existing auth, just need `/me` + user metadata |
| **Complete Auth System** | `@bitwild/rockets-server-auth` | You need login, signup, recovery, OAuth, admin |
| **Both** (Recommended) | `rockets` + `rockets-server-auth` | Complete system with external provider option |

> `rockets-core` is imported by both `rockets` and `rockets-server-auth`. You only
> need to depend on it directly when using it stand-alone.

### **Feature Comparison:**

| Feature | rockets-server | rockets-server-auth |
|---------|----------------|---------------------|
| **Endpoints** | 2 (`GET /me`, `PATCH /me`) | 15+ (complete auth system) |
| **Auth Provider** | External (Auth0, Firebase) | Built-in (local, OAuth) |
| **User Management** | Metadata only | Full CRUD + admin |
| **OAuth Support** | ❌ | ✅ (Google, GitHub, Apple) |
| **Password Recovery** | ❌ | ✅ |
| **OTP/2FA** | ❌ | ✅ |
| **Admin Features** | ❌ | ✅ |
| **Setup Complexity** | Low | Medium |

### **User Type Systems**

This project uses two complementary user type systems:

#### rockets-server-auth (Authentication)
- **Purpose:** Authentication, authorization, and user identity
- **Key Types:** `RocketsAuthUserInterface`, credentials, roles
- **Used by:** Auth controllers, guards, JWT providers
- **Focus:** "Who is this user?" and "What can they do?"

#### rockets-server (User Metadata)
- **Purpose:** Extended user profile data and application-specific attributes  
- **Key Types:** `UserEntityInterface`, `UserMetadataEntityInterface`
- **Used by:** Application features, user profiles, settings
- **Focus:** "What do we know about this user?"

#### Relationship
- **Auth user** (sub claim) → links to → **Application user** (id)
- **Auth handles:** User authentication and authorization
- **Metadata handles:** User profile data and application state
- **Integration:** Both systems work together via shared user identifiers

---

## 🏗️ **Project Foundation Setup**

### **Phase 1: Create NestJS Project**

```bash
# Create new NestJS project
npx @nestjs/cli@10 new my-app-with-rockets --package-manager yarn --language TypeScript --strict
cd my-app-with-rockets
```

### **Phase 2: Install Rockets Packages**

#### **Option A: rockets-server (External Auth)**
```bash
yarn add @bitwild/rockets-server @concepta/nestjs-typeorm-ext \
  @concepta/nestjs-common typeorm @nestjs/typeorm @nestjs/config \
  class-transformer class-validator sqlite3
```

#### **Option B: rockets-server-auth (Complete System)**
```bash
yarn add @bitwild/rockets-server-auth @bitwild/rockets-server \
  @concepta/nestjs-typeorm-ext @concepta/nestjs-common \
  typeorm @nestjs/typeorm @nestjs/config @nestjs/swagger \
  class-transformer class-validator sqlite3
```

#### **Option C: Both Packages (Recommended)**
```bash
yarn add @bitwild/rockets-server-auth @bitwild/rockets-server \
  @concepta/nestjs-typeorm-ext @concepta/nestjs-common \
  typeorm @nestjs/typeorm @nestjs/config @nestjs/swagger \
  class-transformer class-validator sqlite3
```

### **Phase 3: Application Configuration**

⚠️ **Important:** If using `@bitwild/rockets-server`, you'll need dynamic repository tokens. See [Phase 3.1: Dynamic Repository Tokens](#phase-31-dynamic-repository-tokens-critical) before proceeding.

#### **Template A: Complete Auth System (Recommended)**
```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RocketsAuthModule } from '@bitwild/rockets-server-auth';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'sqlite',
        database: 'database.sqlite',
        autoLoadEntities: true,
        synchronize: true, // Only for development
      }),
    }),
    RocketsAuthModule.forRoot({
      settings: {
        // Enable features you need
        authLocal: { enabled: true },
        authJwt: { enabled: true },
        authRecovery: { enabled: true },
        authOAuth: { enabled: true },
        userAdmin: { enabled: true },
        otp: { enabled: true },
      },
    }),
  ],
})
export class AppModule {}
```

#### **Template B: External Auth Only**
```typescript
// app.module.ts  
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RocketsServerModule } from '@bitwild/rockets-server';
import { YourAuthProvider } from './auth/your-auth.adapter';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'sqlite',
        database: 'database.sqlite',
        autoLoadEntities: true,
        synchronize: true,
      }),
    }),
    RocketsServerModule.forRoot({
      authProvider: YourAuthProvider, // Your Auth0/Firebase provider
    }),
  ],
})
export class AppModule {}
```

#### **Template C: Both Packages Integration**
```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { RocketsAuthModule } from '@bitwild/rockets-server-auth';
import { RocketsServerModule } from '@bitwild/rockets-server';
import { RocketsAuthJwtProvider } from '@bitwild/rockets-server-auth';

@Module({
  imports: [
    // Complete auth system
    RocketsAuthModule.forRoot({...}),
    // Server with rockets auth provider
    RocketsServerModule.forRoot({
      authProvider: RocketsAuthJwtProvider, // Use rockets auth as provider
    }),
  ],
})
export class AppModule {}
```

### **Phase 3.1: Dynamic Repository Tokens (Critical)**

When using `@bitwild/rockets-server`, every dynamic-repository row in the
app — including the user-metadata table — flows through a single root
adapter you set on `RocketsModule.forRootAsync`:

```ts
// app.module.ts
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import { RocketsModule } from '@bitwild/rockets';
import { defineModuleResource } from '@bitwild/rockets-core';
import { UserMetadataEntity } from './entities/user-metadata.entity';
import { UserMetadataCreateDto, UserMetadataUpdateDto } from './dto/user-metadata.dto';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:',
      entities: [UserMetadataEntity /*, ... */],
      synchronize: true,
    }),
    RocketsModule.forRootAsync({
      useFactory: () => ({ authProvider: /* your provider */ }),
      // Root adapter — applied to userMetadata + every defineResource /
      // defineModuleResource entity unless they declare their own override.
      repository: TypeOrmRepositoryModule,
      userMetadata: {
        entity: UserMetadataEntity,
        createDto: UserMetadataCreateDto,
        updateDto: UserMetadataUpdateDto,
        // repository: FirestoreRepositoryModule, // optional per-entity override
      },
      resources: [
        // CRUD bundles auto-contribute their entity row.
        // defineModuleResource bundles add extra rows + Nest wiring:
        defineModuleResource({
          entities: [{ key: 'audit', entity: AuditLogEntity }],
          module: { providers: [AuditService], exports: [AuditService] },
        }),
      ],
    }),
  ],
})
export class AppModule {}
```

If you omit `repository` AND `userMetadata.repository`, the user-metadata
row is assumed to be registered by an upstream module (e.g. auth persistence
compiled via `defineRocketsAuth` into the same planner as `resources[]`).
Otherwise you'll see:

```
Nest can't resolve dependencies of the UserMetadataModelService (..., DYNAMIC_REPOSITORY_TOKEN_userMetadata).
```

Make sure `UserMetadataEntity` is also included in your TypeORM entities list.

**Custom persistence (non-TypeORM)** — supply your own adapter
implementing `RepositoryModuleInterface` either as the root `repository`
or per-entity. As a last resort you can still bind the dynamic
repository token manually:

```ts
// user-metadata.repository.adapter.ts (implements RepositoryInterface<UserMetadataEntityInterface>)
export class UserMetadataRepositoryAdapter implements RepositoryInterface<UserMetadataEntityInterface> {
  // implement find, findOne, create, update, remove, etc.
}

// app.module.ts
@Module({
  providers: [
    {
      // Token must match the key used by InjectDynamicRepository('userMetadata')
      // e.g., dynamic repository token for 'userMetadata'
      provide: /* token for 'userMetadata' dynamic repository */ 'DYNAMIC_REPOSITORY_TOKEN_userMetadata',
      useClass: UserMetadataRepositoryAdapter,
    },
  ],
  exports: [/* export provider if consumed in other modules */],
})
export class AppModule {}
```

Using option (1) with `TypeOrmExtModule.forFeature` is the simplest and is what our examples use.

### **Phase 4: Main Application Setup**
```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerUiService } from '@bitwild/rockets-server-auth'; // or rockets-server
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));

  // Swagger setup (automatic with rockets)
  const swaggerUiService = app.get(SwaggerUiService);
  swaggerUiService.builder().addBearerAuth();
  swaggerUiService.setup(app);

  await app.listen(3000);
  console.log('🚀 Rockets Server running on http://localhost:3000');
  console.log('📚 API Docs available at http://localhost:3000/api');
}
bootstrap();
```

---

## 🎯 **Module Generation Workflow**

### **Phase 2: Standardized Module Generation**

Every business module follows this **exact 12-file structure**:

```
src/modules/artist/
├── artist.interface.ts              # All interfaces & enums
├── artist.entity.ts                 # TypeORM entity
├── artist.dto.ts                    # All DTOs (Create, Update, Paginated)
├── artist.exception.ts              # All custom exceptions  
├── artist.constants.ts              # Module constants
├── artist-model.service.ts          # Business logic
├── artist-model.service.spec.ts     # Model service tests
├── artist-typeorm-crud.adapter.ts   # Database adapter
├── artist.crud.service.ts           # CRUD operations
├── artist.crud.service.spec.ts      # CRUD service tests
├── artist.crud.controller.ts        # API endpoints
├── artist-access-query.service.ts   # Access control
└── artist.module.ts                 # Module definition
```

### **File Generation Order (Critical for AI)**

**Always generate in this order to avoid dependency issues:**

1. **Foundation Files**
   - `artist.interface.ts` - Base interfaces and enums
   - `artist.entity.ts` - Database entity
   - `artist.constants.ts` - Module constants

2. **API Layer**  
   - `artist.dto.ts` - API contracts and validation
   - `artist.exception.ts` - Error handling

3. **Business Layer**
   - `artist-model.service.ts` - Business logic
   - `artist-typeorm-crud.adapter.ts` - Database adapter
   - `artist.crud.service.ts` - CRUD operations

4. **Security & API**
   - `artist-access-query.service.ts` - Access control
   - `artist.crud.controller.ts` - API endpoints

5. **Module & Tests**
   - `artist.module.ts` - Dependency injection
   - `*.spec.ts` files - Tests

### **AI Module Generation Prompt Template**

```
Create a complete {Entity} module following the Rockets Server pattern.

STRUCTURE: Generate these 12 files in exact order:
1. {entity}.interface.ts - All interfaces and enums
2. {entity}.entity.ts - TypeORM entity extending CommonPostgresEntity  
3. {entity}.constants.ts - Module constants and entity keys
4. {entity}.dto.ts - Create, Update, Paginated DTOs using PickType patterns
5. {entity}.exception.ts - Custom exceptions extending RuntimeException
6. {entity}-model.service.ts - Business logic extending ModelService
7. {entity}-typeorm-crud.adapter.ts - Database adapter extending TypeOrmCrudAdapter
8. {entity}.crud.service.ts - CRUD operations extending CrudService
9. {entity}-access-query.service.ts - Access control implementing CanAccess
10. {entity}.crud.controller.ts - API endpoints with @CrudController
11. {entity}.module.ts - Module with TypeORM imports and providers
12. Test files as needed

PATTERNS TO FOLLOW:
- Use @concepta/nestjs-crud for CRUD operations
- Follow established exception hierarchy 
- Implement proper access control with CanAccess
- Use TypeORM relationships correctly
- Import constants from {entity}.constants.ts
- Business validation in model service
- Simple adapter methods calling super with error handling
```

---

## 🔧 **Integration Examples**

### **Add Your Module to App**
```typescript
// app.module.ts
@Module({
  imports: [
    // Rockets foundation
    RocketsAuthModule.forRoot({...}),
    
    // Your business modules
    ArtistModule,
    AlbumModule, 
    SongModule,
    // ... other modules
  ],
})
export class AppModule {}
```

### **Module Dependencies**
```typescript
// artist.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([ArtistEntity]),
    TypeOrmExtModule.forFeature({
      artist: { entity: ArtistEntity }, // Use constants
    }),
  ],
  controllers: [ArtistCrudController],
  providers: [
    ArtistTypeOrmCrudAdapter,
    ArtistModelService,
    ArtistCrudService,
    ArtistAccessQueryService,
  ],
  exports: [ArtistModelService, ArtistTypeOrmCrudAdapter],
})
export class ArtistModule {}
```

### **Cross-Module Usage**
```typescript
// album.module.ts - Using artist in album
@Module({
  imports: [
    ArtistModule, // Import artist module
    TypeOrmModule.forFeature([AlbumEntity]),
  ],
  // ...
})
export class AlbumModule {}
```

---

## 📊 **Available Endpoints by Package**

### **rockets-server Endpoints (2 total)**
```
GET    /me           # Get user metadata
PATCH  /me           # Update user metadata
```

### **rockets-server-auth Endpoints (15+ total)**
```
# Authentication
POST   /auth/login         # User login
POST   /auth/signup        # User registration  
POST   /auth/recovery      # Password recovery
POST   /auth/refresh       # Refresh token

# OAuth
GET    /auth/oauth/google  # Google OAuth
GET    /auth/oauth/github  # GitHub OAuth
GET    /auth/oauth/apple   # Apple OAuth

# OTP/2FA
POST   /auth/otp/send      # Send OTP
POST   /auth/otp/verify    # Verify OTP

# Admin (when enabled)
GET    /admin/users        # List users
POST   /admin/users        # Create user
PATCH  /admin/users/:id    # Update user
DELETE /admin/users/:id    # Delete user

# User Management
GET    /user              # Get profile
PATCH  /user              # Update profile
```

---

## 🎯 **Success Checklist**

### **✅ Project Foundation Complete When:**
- [ ] Rockets packages installed and configured
- [ ] Database connection working
- [ ] Swagger documentation accessible
- [ ] Authentication endpoints responding
- [ ] Global validation pipe configured

### **✅ Module Generation Complete When:**
- [ ] All 12 files created in correct order
- [ ] TypeScript compilation successful
- [ ] Module imported in app.module.ts
- [ ] API endpoints visible in Swagger
- [ ] Access control properly configured
- [ ] Business validation working
- [ ] Error handling implemented

### **✅ Ready for Production When:**
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] Database migrations set up
- [ ] Error logging configured
- [ ] Security hardening complete

---

## ⚡ **Next Steps**

After completing foundation setup:

1. **📖 Read [AI_TEMPLATES_GUIDE.md](./AI_TEMPLATES_GUIDE.md)** - Get copy-paste templates for module generation
2. **📖 Read [CRUD_PATTERNS_GUIDE.md](./CRUD_PATTERNS_GUIDE.md)** - Understand CRUD implementation patterns
3. **📖 Read [ACCESS_CONTROL_GUIDE.md](./ACCESS_CONTROL_GUIDE.md)** - Implement security and permissions

**🚀 You're ready to build scalable applications with Rockets SDK!**