# Rockets - Enterprise Authentication Framework for NestJS

> **Last Updated:** 2025-11-05
> **Version:** 0.1.0-dev.8
> **Status:** Alpha Development
> **License:** BSD-3-Clause

## Executive Summary

Rockets is a comprehensive, enterprise-grade authentication and user management framework for NestJS applications. Built as a TypeScript monorepo using Yarn Workspaces and Lerna, it provides modular authentication solutions including JWT, OAuth, OTP, password management, and role-based access control (RBAC). The framework is designed for rapid enterprise development with strong typing, extensive testing, and production-ready security features.

**Tech Stack:** TypeScript 5.4 + NestJS 10.4 + TypeORM + Yarn Workspaces + Lerna

## Project Structure

```
rockets/
├── packages/
│   ├── rockets-server/           # Core server functionality and base auth provider
│   └── rockets-server-auth/      # Full auth module (JWT, OAuth, OTP, roles, users)
├── examples/
│   ├── sample-server/            # Basic server example
│   └── sample-server-auth/       # Full auth implementation with roles
├── development-guides/           # 13+ comprehensive development guides
│   ├── ROCKETS_PACKAGES_GUIDE.md
│   ├── AUTHENTICATION_ADVANCED_GUIDE.md
│   ├── ACCESS_CONTROL_GUIDE.md
│   ├── TESTING_GUIDE.md
│   └── [9 more guides...]
├── docker/                       # Docker configurations (PostgreSQL, Redis)
├── .github/workflows/            # CI/CD pipelines (test, lint, coverage)
├── .devcontainer/                # VS Code DevContainer config
└── scripts/                      # Utility scripts
```

## Technology Stack

### Core Framework
- **Language:** TypeScript 5.4.0 (strict mode)
- **Framework:** NestJS 10.4.1 (Express-based)
- **Runtime:** Node.js >=18.0.0
- **Package Manager:** Yarn 4.4.0 (via Corepack)
- **Monorepo:** Yarn Workspaces + Lerna 3.22.1

### Authentication & Security
- **JWT:** `@nestjs/jwt`, `jsonwebtoken` v9.0.2
- **Passport.js:** `passport` v0.7.0, `passport-jwt` v4.0.1
- **OAuth Providers:** Google, GitHub, Apple via `@concepta/nestjs-auth-*`
- **Rate Limiting:** `@nestjs/throttler` v6.4.0+
- **Security Headers:** `helmet` v8.1.0
- **Access Control:** `accesscontrol` v2.2.1 (RBAC)

### Data & Persistence
- **ORM:** TypeORM v0.3.20
- **Databases:** SQLite3 (dev), PostgreSQL (prod)
- **Validation:** `class-validator` v0.14.1, `class-transformer` v0.5.1

### Documentation & API
- **API Docs:** Swagger/OpenAPI via `@nestjs/swagger` v11.2.1+
- **Code Docs:** TypeDoc v0.25.13 with coverage plugin

### Development Tools
- **Testing:** Jest 27.5.1 + ts-jest v27.1.5 + Supertest v7.1.4
- **Linting:** ESLint v8.57.0 + `@concepta/eslint-config`
- **Formatting:** Prettier v2.8.8 + `@concepta/prettier-config`
- **Git Hooks:** Husky v7.0.4 + commitlint (Conventional Commits)
- **Markdown:** markdownlint-cli v0.41.0

## Key Architectural Patterns

### 1. Monorepo with Yarn Workspaces

**Location:** `package.json` workspaces field, `lerna.json`

**Pattern:** Multiple packages managed as a single repository, with shared dependencies and cross-package linking.

```typescript
// Workspace structure
workspaces: {
  packages: ["packages/*", "examples/*"]
}

// Package references (@bitwild/rockets-*)
import { RocketsServerModule } from '@bitwild/rockets-server';
import { RocketsServerAuthModule } from '@bitwild/rockets-server-auth';
```

**Best Practices:**
- Build with TypeScript project references (`tsc --build`)
- Use `yarn` at root for all operations (not `npm`)
- Lerna manages versioning across packages

### 2. Modular Authentication Architecture

**Location:** `packages/rockets-server-auth/src/domains/`

**Domains:**
- `auth/` - Core authentication logic, JWT strategies
- `oauth/` - OAuth providers (Google, GitHub, Apple)
- `user/` - User management, profiles, metadata
- `password/` - Password hashing, validation, recovery
- `otp/` - One-time passwords, multi-factor auth
- `role/` - Role-based access control

**Pattern:** Each domain is independently configurable via NestJS module imports.

```typescript
// Example: Enable only JWT + users (minimal)
@Module({
  imports: [
    RocketsServerModule.forRoot({
      auth: { jwt: true },
      users: true
    })
  ]
})

// Example: Enable full auth suite
@Module({
  imports: [
    RocketsServerAuthModule.forRoot({
      auth: { jwt: true, local: true, refresh: true },
      oauth: { google: true, github: true },
      users: true,
      roles: true,
      otp: true,
      passwordRecovery: true
    })
  ]
})
```

### 3. Global Authentication Guards

**Location:** `packages/rockets-server/src/providers/rockets-auth.provider.ts`

**Pattern:** Centralized JWT authentication guard applied globally, with route-level opt-out via decorators.

```typescript
// Global guard setup
@Injectable()
export class RocketsAuthProvider implements NestJSAuthProvider {
  provide() {
    return new AuthGuard('jwt'); // Applied to all routes by default
  }
}

// Route opt-out
@Public() // Skip auth for this route
@Post('login')
async login(@Body() credentials: LoginDto) { ... }
```

### 4. DTO-First API Design

**Location:** `packages/*/src/**/*.dto.ts`

**Pattern:** All endpoints use strongly-typed DTOs with class-validator decorators.

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignupDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
```

**Benefits:**
- Automatic validation via NestJS ValidationPipe
- Auto-generated Swagger/OpenAPI documentation
- Type safety across client/server boundary

### 5. Concepta Module Ecosystem

**Location:** `packages/*/package.json` dependencies

**Pattern:** Rockets leverages a large collection of `@concepta/nestjs-*` microservice-style modules for specific features.

**Key Modules:**
- `@concepta/nestjs-authentication` - Core auth abstractions
- `@concepta/nestjs-auth-jwt` - JWT strategy implementation
- `@concepta/nestjs-auth-local` - Local (username/password) auth
- `@concepta/nestjs-auth-refresh` - Refresh token handling
- `@concepta/nestjs-user` - User management
- `@concepta/nestjs-role` - RBAC implementation
- `@concepta/nestjs-email` - Email service integration
- `@concepta/nestjs-otp` - OTP generation and validation
- `@concepta/nestjs-crud` - Generic CRUD operations
- `@concepta/nestjs-typeorm-ext` - TypeORM extensions

**Why This Matters:** When debugging or extending features, you may need to trace through Concepta module source code. These are peer dependencies, not internal to Rockets.

### 6. TypeORM Entity Customization

**Location:** `packages/rockets-server-auth/src/entities/*.entity.ts`

**Pattern:** Base entities from Concepta modules can be extended with custom fields.

```typescript
// Standard approach: Use default Concepta entities
import { UserEntity } from '@concepta/nestjs-user';

// Advanced approach: Extend with custom fields
@Entity('user')
export class CustomUserEntity extends UserEntity {
  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}
```

**Guidance:** Refer to `development-guides/ADVANCED_ENTITIES_GUIDE.md` for entity customization patterns.

### 7. Testing Strategy

**Location:** `packages/*/src/**/*.spec.ts` (unit), `packages/*/e2e/*.spec.ts` (e2e)

**Patterns:**
- **Unit Tests:** Jest with mocks (`jest-mock-extended`)
- **Integration Tests:** Supertest for HTTP endpoint testing
- **E2E Tests:** Full app bootstrap with test database
- **Coverage:** Minimum 80% required (enforced in CI)

```typescript
// Example unit test
describe('AuthService', () => {
  let service: AuthService;
  let mockUserRepo: jest.Mocked<UserRepository>;

  beforeEach(async () => {
    mockUserRepo = mock<UserRepository>();
    service = new AuthService(mockUserRepo);
  });

  it('should authenticate valid credentials', async () => { ... });
});
```

**Commands:**
- `yarn test` - Run all unit tests
- `yarn test:e2e` - Run e2e tests
- `yarn test:cov` - Generate coverage report
- `yarn test:ci` - CI mode with JUnit reports

## Development Workflows

### Initial Setup

```bash
# Install dependencies (uses Yarn 4.4.0)
yarn install

# Build all packages with TypeScript project references
yarn build

# Run tests to verify setup
yarn test
```

### Common Tasks

| Task | Command | Notes |
|------|---------|-------|
| **Install deps** | `yarn install` | Runs `husky install` postinstall hook |
| **Build** | `yarn build` | Compiles all packages with `tsc --build` |
| **Watch mode** | `yarn watch` | Build + watch for changes |
| **Clean** | `yarn clean` | Remove dist/ and *.tsbuildinfo files |
| **Lint** | `yarn lint` | ESLint on packages/*/src/**/*.ts |
| **Lint fix** | `yarn lint:fix` | Auto-fix linting issues |
| **Lint markdown** | `yarn lint:md` | Check README.md and package docs |
| **Test** | `yarn test` | Jest with 30s timeout |
| **Test E2E** | `yarn test:e2e` | End-to-end tests |
| **Coverage** | `yarn test:cov` | Generate coverage report |
| **Documentation** | `yarn doc` | Generate TypeDoc at /docs |
| **Swagger** | `yarn generate-swagger` | Generate OpenAPI spec |

### Working with Examples

```bash
# Navigate to example
cd examples/sample-server-auth

# Install dependencies (handled by workspace)
yarn install

# Run example server
yarn start:dev

# Access Swagger UI
open http://localhost:3000/api
```

### Publishing Workflow

```bash
# Clean and build
yarn prepublish

# Generate changelog (bump version)
yarn changelog:patch  # or :minor or :major

# Publish to npm (via Lerna)
lerna publish
```

## Critical Files & Conventions

| File/Pattern | Purpose | Change Frequency | Location |
|--------------|---------|------------------|----------|
| `lerna.json` | Monorepo version management | Rarely | `/lerna.json` |
| `package.json` | Workspace config, scripts, deps | Often | `/package.json` |
| `tsconfig.json` | TypeScript root config | Rarely | `/tsconfig.json` |
| `jest.config.js` | Jest test configuration | Rarely | `/jest.config.js` |
| `.eslintrc.js` | ESLint rules | Rarely | `/.eslintrc.js` |
| `*.dto.ts` | API request/response DTOs | Often | `packages/*/src/**/*.dto.ts` |
| `*.entity.ts` | Database entities | Sometimes | `packages/*/src/entities/*.entity.ts` |
| `*.module.ts` | NestJS module definitions | Often | `packages/*/src/**/*.module.ts` |
| `*.service.ts` | Business logic services | Often | `packages/*/src/**/*.service.ts` |
| `*.controller.ts` | HTTP endpoint controllers | Often | `packages/*/src/**/*.controller.ts` |

### Naming Conventions

- **Modules:** `RocketsServerAuthModule`, `UserModule`, `AuthModule`
- **Services:** `UserService`, `AuthService`, `OtpService`
- **Controllers:** `UserController`, `AuthController` (lowercase routes)
- **Entities:** `UserEntity`, `RoleEntity`, `OtpEntity`
- **DTOs:** `SignupDto`, `LoginDto`, `UpdateUserDto`
- **Interfaces:** `IUserService`, `IAuthStrategy` (prefixed with `I`)

### Code Standards

- **Strict TypeScript:** No implicit `any`, strict null checks enabled
- **Functional style preferred:** Avoid mutation, prefer pure functions
- **JSDoc required:** Public APIs must have JSDoc comments
- **No default exports:** Use named exports only
- **Async/await:** Prefer async/await over promise chains
- **Error handling:** Use NestJS exception filters (HttpException, etc.)

## Current State

### Recent Changes (PR #15: feature/server-auth)

- **Added:** Full authentication module (`rockets-server-auth`)
- **Added:** OAuth support (Google, GitHub, Apple)
- **Added:** Password recovery with email codes
- **Added:** OTP/multi-factor authentication
- **Added:** Role-based access control
- **Updated:** Jest configuration for better test isolation
- **Updated:** Linting rules for stricter code quality

### Known Issues

- **Alpha Status:** API surface may change before v1.0.0
- **Documentation:** Some advanced features lack usage examples
- **Testing:** E2E test coverage below unit test coverage

### Active Development Areas

- **Authentication:** Expanding OAuth provider support
- **Authorization:** Fine-grained permissions system
- **Documentation:** Completing all development guides
- **Examples:** More real-world sample applications
- **Testing:** Improving E2E test coverage

## Testing Strategy

### Running Tests

```bash
# Unit tests only
yarn test

# E2E tests only
yarn test:e2e

# All tests
yarn test:all

# With coverage
yarn test:cov

# Watch mode
yarn test:watch

# Debug mode
yarn test:debug
```

### Writing Tests

**Unit Test Template:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a user', async () => {
    const user = await service.create({ email: 'test@example.com' });
    expect(user).toHaveProperty('id');
  });
});
```

**E2E Test Template:**
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/auth/signup (POST)', () => {
    return request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'test@example.com', password: 'password123' })
      .expect(201);
  });
});
```

## Common Pitfalls

### 1. Forgetting to Build After Changes

**Problem:** TypeScript files not compiled, changes not reflected.

**Solution:** Run `yarn build` or `yarn watch` for auto-rebuild.

### 2. Workspace Dependency Issues

**Problem:** Changes in `rockets-server` not reflected in `rockets-server-auth`.

**Solution:** Use `yarn build` (not `tsc` directly) to build with project references.

### 3. Using npm Instead of yarn

**Problem:** Package manager mismatch causes lockfile conflicts.

**Solution:** Always use `yarn` (v4.4.0 via Corepack). Never use `npm`.

### 4. Not Running Tests Before Commit

**Problem:** Husky pre-commit hooks may fail.

**Solution:** Run `yarn test && yarn lint` before committing.

### 5. Hardcoding Configuration

**Problem:** Secrets in code, not environment variables.

**Solution:** Use `@nestjs/config` and `.env` files (git-ignored).

### 6. Skipping DTO Validation

**Problem:** Invalid data reaches service layer.

**Solution:** Always use `ValidationPipe` globally:
```typescript
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

### 7. Direct TypeORM Queries

**Problem:** Bypassing service layer, hard to test.

**Solution:** Keep database queries in services/repositories, not controllers.

## Resources

- **GitHub Repository:** https://github.com/bitwild/rockets
- **Development Guides:** `/development-guides/*.md` (13 comprehensive guides)
- **Concepta Docs:** https://github.com/concepta (upstream module documentation)
- **NestJS Docs:** https://docs.nestjs.com
- **TypeORM Docs:** https://typeorm.io
- **Swagger UI:** `http://localhost:3000/api` (when server running)

## Quick Start for New Contributors

1. **Clone and install:**
   ```bash
   git clone <repo-url>
   cd rockets
   yarn install
   ```

2. **Build and test:**
   ```bash
   yarn build
   yarn test
   ```

3. **Run example:**
   ```bash
   cd examples/sample-server-auth
   yarn start:dev
   # Open http://localhost:3000/api
   ```

4. **Read guides:**
   - Start with `development-guides/ROCKETS_PACKAGES_GUIDE.md`
   - Then `development-guides/AUTHENTICATION_ADVANCED_GUIDE.md`
   - Explore other guides as needed

5. **Make changes:**
   - Edit files in `packages/rockets-server-auth/src/`
   - Run `yarn build` to compile
   - Run `yarn test` to verify
   - Run `yarn lint:fix` before committing

## Architecture Diagrams

### Authentication Flow

```
Client Request
    ↓
Global JWT Guard (if enabled)
    ↓
Controller (@Public() to skip)
    ↓
DTO Validation (ValidationPipe)
    ↓
Service Layer (business logic)
    ↓
Repository/TypeORM (data access)
    ↓
Database (SQLite/PostgreSQL)
```

### Module Dependency Graph

```
RocketsServerAuthModule
    ├── RocketsServerModule (base)
    ├── UserModule
    ├── AuthModule
    │   ├── JwtAuthModule
    │   ├── LocalAuthModule
    │   └── RefreshAuthModule
    ├── OAuthModule
    │   ├── GoogleAuthModule
    │   ├── GithubAuthModule
    │   └── AppleAuthModule
    ├── PasswordModule
    ├── OtpModule
    └── RoleModule
```

## Environment Variables

Key environment variables (typically in `.env` file):

```bash
# Database
DATABASE_TYPE=postgres
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=rockets
DATABASE_PASSWORD=rockets
DATABASE_NAME=rockets_dev

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRATION=3600s
JWT_REFRESH_SECRET=your-refresh-secret-here
JWT_REFRESH_EXPIRATION=7d

# OAuth (Google example)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Email (for password recovery, OTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@example.com
SMTP_PASSWORD=email-password
SMTP_FROM=noreply@example.com

# Application
NODE_ENV=development
PORT=3000
API_PREFIX=api
```

## Support & Contribution

- **Issues:** Report bugs via GitHub Issues
- **PRs:** Follow Conventional Commits format (`feat:`, `fix:`, `chore:`, etc.)
- **Commits:** Enforced by commitlint via Husky pre-commit hook
- **Code Review:** All PRs require passing CI (lint, test, coverage)

---

**Last Updated:** 2025-11-05 | **Maintainer:** BitWild Team
