# Rockets Server - Architecture & Context

> **Last Updated:** 2025-11-05
> **Version:** 0.1.0-dev.8
> **Repository:** https://github.com/conceptadev/rockets

## Executive Summary

**Rockets Server** is a comprehensive authentication and user management solution for NestJS applications built on TypeScript. It provides enterprise-grade authentication (JWT, OAuth providers), user management, OTP verification, email notifications, and automatic API documentation out of the box.

**Tech Stack:**
- Framework: NestJS 10.x
- Language: TypeScript 5.x
- Monorepo: Lerna 3.x + Yarn Workspaces (Yarn 4.4.0)
- Testing: Jest 27.x
- Database: TypeORM 0.3.x (database-agnostic)
- Documentation: TypeDoc, Swagger/OpenAPI
- CI/CD: GitHub Actions

**Key Features:**
- Multiple authentication strategies (JWT, Local, OAuth: Apple/GitHub/Google)
- User management with CRUD operations
- OTP verification system
- Password recovery flow
- JWT refresh tokens
- Email notifications
- Role-based access control (RBAC)
- Federated identity support
- Auto-generated API documentation
- Rate limiting and security features (Helmet)

## Project Structure

```
rockets/
├── packages/
│   ├── rockets-server/           # Core server functionality
│   │   ├── src/
│   │   │   ├── rockets-server.module.ts
│   │   │   ├── guards/            # Global guards
│   │   │   ├── interfaces/        # TypeScript interfaces
│   │   │   └── generate-swagger.ts
│   │   └── package.json
│   │
│   └── rockets-server-auth/      # Authentication module (main package)
│       ├── src/
│       │   ├── rockets-auth.module.ts          # Main module
│       │   ├── rockets-auth.module-definition.ts
│       │   ├── domains/           # Domain-specific modules
│       │   │   ├── user/          # User management
│       │   │   ├── auth/          # Auth strategies
│       │   │   ├── otp/           # OTP verification
│       │   │   ├── federated/     # Federated auth
│       │   │   └── role/          # RBAC
│       │   ├── guards/            # Authentication guards
│       │   ├── services/          # Business logic
│       │   ├── provider/          # Providers
│       │   ├── interfaces/        # TypeScript interfaces
│       │   ├── shared/            # Shared utilities
│       │   ├── __fixtures__/      # Test fixtures
│       │   └── generate-swagger.ts
│       └── package.json
│
├── examples/                      # Example applications
├── development-guides/            # Development documentation
├── docker/                        # Docker configurations
├── .github/workflows/             # CI/CD pipelines
├── .husky/                        # Git hooks
├── jest.config.json              # Jest configuration (unit)
├── jest.config-e2e.json          # Jest configuration (e2e)
├── lerna.json                    # Lerna configuration
├── tsconfig.json                 # TypeScript configuration
└── package.json                  # Root package.json
```

## Monorepo Architecture

### Package Dependencies

```
@bitwild/rockets-server (0.1.0-dev.1)
└── Core server module
    └── Base configuration
    └── Global guards
    └── Swagger UI integration

@bitwild/rockets-server-auth (0.1.0-dev.8)
├── Depends on: @bitwild/rockets-server
└── Integrates @concepta/nestjs-modules:
    ├── @concepta/nestjs-auth-jwt
    ├── @concepta/nestjs-auth-local
    ├── @concepta/nestjs-auth-apple
    ├── @concepta/nestjs-auth-github
    ├── @concepta/nestjs-auth-google
    ├── @concepta/nestjs-auth-recovery
    ├── @concepta/nestjs-auth-refresh
    ├── @concepta/nestjs-auth-verify
    ├── @concepta/nestjs-user
    ├── @concepta/nestjs-otp
    ├── @concepta/nestjs-password
    ├── @concepta/nestjs-role
    ├── @concepta/nestjs-federated
    ├── @concepta/nestjs-email
    ├── @concepta/nestjs-crud
    ├── @concepta/nestjs-access-control
    └── @concepta/nestjs-swagger-ui
```

### Workspace Configuration

**Lerna manages:**
- Version management across packages
- Publishing to npm
- Conventional commits changelog generation

**Yarn Workspaces manages:**
- Dependency hoisting
- Local package linking
- Workspace scripts

## Key Architectural Patterns

### 1. Module-Based Architecture (NestJS)

Rockets Server follows NestJS modular architecture:

```typescript
// packages/rockets-server-auth/src/rockets-auth.module.ts
@Module({
  imports: [
    // Domain modules
    UserModule,
    AuthModule,
    OtpModule,
    FederatedModule,
    RoleModule,
  ],
  providers: [
    // Global guards
    AuthenticationGuard,
  ],
})
export class RocketsAuthModule {}
```

### 2. Dynamic Module Pattern

Uses NestJS dynamic modules for flexible configuration:

```typescript
// Usage example from README
RocketsServerAuthModule.forRoot({
  user: {
    imports: [
      TypeOrmExtModule.forFeature({
        user: { entity: UserEntity },
      }),
    ],
  },
  otp: {
    imports: [
      TypeOrmExtModule.forFeature({
        userOtp: { entity: UserOtpEntity },
      }),
    ],
  },
  services: {
    mailerService: customMailerService,
  },
})
```

### 3. Domain-Driven Design (DDD)

Each domain is self-contained:
- `domains/user/` - User management (CRUD, validation)
- `domains/auth/` - Authentication strategies
- `domains/otp/` - OTP generation and verification
- `domains/federated/` - Federated identity
- `domains/role/` - Role-based access control

### 4. Strategy Pattern (Passport.js)

Multiple authentication strategies:
- `LocalStrategy` - Username/password
- `JwtStrategy` - JWT token validation
- `AppleStrategy` - Sign in with Apple
- `GitHubStrategy` - OAuth GitHub
- `GoogleStrategy` - OAuth Google

### 5. Guard Pattern (NestJS)

Protection layers:
```typescript
// Global authentication guard
@UseGuards(AuthenticationGuard)
export class UserController {}
```

### 6. TypeORM Entity Pattern

Database-agnostic entities:
```typescript
// User must provide entities
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  // ... other fields
}
```

### 7. Dependency Injection

Heavy use of NestJS DI:
```typescript
constructor(
  @Inject(USER_SERVICE_TOKEN)
  private userService: UserService,
  @Inject(JWT_SERVICE_TOKEN)
  private jwtService: JwtService,
) {}
```

## Development Workflows

### Initial Setup

```bash
# Clone repository
git clone https://github.com/conceptadev/rockets.git
cd rockets

# Install dependencies
yarn install

# Bootstrap packages (link workspace dependencies)
# Not needed with Yarn 4 workspaces, but if using Lerna:
# npx lerna bootstrap

# Build all packages
yarn build

# Run tests
yarn test
yarn test:e2e
```

### Development Commands

```bash
# Build
yarn build                    # Build all packages
yarn clean                    # Clean build artifacts

# Testing
yarn test                     # Run unit tests
yarn test:watch              # Watch mode
yarn test:cov                # Coverage report
yarn test:e2e                # E2E tests
yarn test:all                # All tests
yarn test:ci                 # CI mode with JUnit output

# Linting
yarn lint                    # Lint TypeScript
yarn lint:fix               # Fix lint issues
yarn lint:md                # Lint markdown
yarn lint:all               # Lint everything

# Documentation
yarn doc                     # Generate TypeDoc
yarn doc:cov                # TypeDoc with coverage

# Versioning
yarn changelog              # Generate CHANGELOG
yarn changelog:minor        # Minor version bump
yarn changelog:patch        # Patch version bump
yarn changelog:major        # Major version bump

# Swagger
yarn generate-swagger       # Generate OpenAPI spec
```

### Building Individual Packages

```bash
# Using TypeScript project references
cd packages/rockets-server
yarn build

cd packages/rockets-server-auth
yarn build
```

### Running Tests

```bash
# All tests from root
yarn test

# Specific package
cd packages/rockets-server-auth
yarn test

# E2E tests
yarn test:e2e

# Watch mode
yarn test:watch
```

### Git Workflow

**Commit Convention:** Conventional Commits (enforced by commitlint + husky)

```bash
# Format
<type>(<scope>): <subject>

# Types
feat:     New feature
fix:      Bug fix
docs:     Documentation
style:    Formatting
refactor: Code restructuring
test:     Tests
chore:    Maintenance

# Examples
feat(auth): add Apple OAuth support
fix(user): resolve email validation bug
docs(readme): update installation instructions
```

**Pre-commit hooks:**
- Lint staged files
- Run affected tests (if configured)

**Branch naming:** No strict convention, but prefer:
- `feature/description`
- `fix/description`
- `docs/description`

## Key Files & Entry Points

### Root Configuration

- `package.json:1` - Root workspace configuration, scripts, dependencies
- `lerna.json:1` - Lerna configuration for version management
- `tsconfig.json:1` - Base TypeScript configuration
- `jest.config.json:1` - Unit test configuration
- `jest.config-e2e.json:1` - E2E test configuration

### Rockets Server Package

- `packages/rockets-server/src/index.ts:1` - Main export
- `packages/rockets-server/src/rockets-server.module.ts:1` - Core module
- `packages/rockets-server/package.json:1` - Package metadata

### Rockets Server Auth Package

- `packages/rockets-server-auth/src/index.ts:1` - Main export
- `packages/rockets-server-auth/src/rockets-auth.module.ts:1` - Main module
- `packages/rockets-server-auth/src/rockets-auth.module-definition.ts:1` - Dynamic module definition
- `packages/rockets-server-auth/package.json:1` - Package metadata

### Domain Modules

- `packages/rockets-server-auth/src/domains/user/` - User management
- `packages/rockets-server-auth/src/domains/auth/` - Auth strategies
- `packages/rockets-server-auth/src/domains/otp/` - OTP system
- `packages/rockets-server-auth/src/domains/federated/` - Federated auth
- `packages/rockets-server-auth/src/domains/role/` - RBAC

### Testing

- `packages/rockets-server-auth/src/rockets-auth.e2e-spec.ts:1` - Main E2E tests
- `packages/rockets-server-auth/src/__fixtures__/` - Test fixtures

## Common Patterns

### 1. Creating a New Module

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [MyController],
  providers: [MyService],
  exports: [MyService],
})
export class MyModule {}
```

### 2. Creating a Guard

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class MyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    return validateRequest(request);
  }
}
```

### 3. Creating a Strategy

```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';

@Injectable()
export class MyStrategy extends PassportStrategy(Strategy, 'my-strategy') {
  async validate(payload: any): Promise<any> {
    // Validation logic
    return user;
  }
}
```

### 4. Using TypeORM Entities

```typescript
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;
}
```

### 5. Testing Controllers

```typescript
import { Test, TestingModule } from '@nestjs/testing';

describe('MyController', () => {
  let controller: MyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MyController],
      providers: [MyService],
    }).compile();

    controller = module.get<MyController>(MyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
```

## Testing Strategy

### Unit Tests
- Location: `*.spec.ts` files alongside source
- Framework: Jest
- Mocking: `jest-mock-extended` for TypeScript
- Coverage: Minimum 80% (not enforced currently)

### E2E Tests
- Location: `*.e2e-spec.ts` files
- Framework: Jest + Supertest
- Database: SQLite in-memory for testing
- Configuration: `jest.config-e2e.json`

### Test Fixtures
- Location: `packages/rockets-server-auth/src/__fixtures__/`
- Purpose: Reusable test entities and modules
- Pattern: `*.fixture.ts` files

## Recent Changes & Current State

**Current Version:** 0.1.0-dev.8 (alpha testing phase)

**Recent Merge:** PR #15 - `feature/server-auth`
- Commits:
  - `b17d348`: Merge pull request #15
  - `7a8ea8a`: chore: jest config
  - `a955fc3`: chore: linting
  - `5491162`: chore: linting
  - `c849702`: chore: lint

**Active Development:**
- Alpha testing phase
- Security hardening (added Helmet, Throttler)
- Swagger documentation improvements
- Preparing for beta release

**Known Issues/TODOs:**
- Contributor License Agreement not yet finalized
- Documentation needs expansion
- Examples need more use cases

## Integration Points

### External Dependencies

**Core NestJS:**
- `@nestjs/common`, `@nestjs/core` - Framework
- `@nestjs/config` - Configuration
- `@nestjs/passport` - Auth strategies
- `@nestjs/jwt` - JWT handling
- `@nestjs/swagger` - API docs
- `@nestjs/typeorm` - Database
- `@nestjs/throttler` - Rate limiting

**Concepta Modules:** (from https://github.com/btwld/nestjs-modules)
- Authentication modules
- User management
- OTP system
- Email service
- CRUD utilities
- Access control

**Security:**
- `helmet` - Security headers
- `passport` - Auth strategies
- `jsonwebtoken` - JWT tokens

### API Endpoints

When `RocketsServerAuthModule` is configured, it exposes:

```
POST   /auth/login          # Local auth login
POST   /auth/signup         # User registration
POST   /auth/refresh        # Refresh JWT token
POST   /auth/recovery       # Password recovery
POST   /auth/verify         # Verify account
GET    /auth/apple          # Apple OAuth
GET    /auth/github         # GitHub OAuth
GET    /auth/google         # Google OAuth

GET    /user                # List users (protected)
GET    /user/:id            # Get user (protected)
POST   /user                # Create user (protected)
PATCH  /user/:id            # Update user (protected)
DELETE /user/:id            # Delete user (protected)

POST   /otp/generate        # Generate OTP
POST   /otp/verify          # Verify OTP

GET    /api                 # Swagger UI (if enabled)
GET    /api-json            # OpenAPI JSON spec
```

## Performance Considerations

1. **Database Queries**
   - Use TypeORM query builder for complex queries
   - Index frequently queried fields (email, id)
   - Eager/lazy loading configuration

2. **Authentication**
   - JWT tokens are stateless (no DB lookup)
   - Consider refresh token rotation
   - Rate limiting on auth endpoints

3. **Caching**
   - No caching implemented currently
   - Consider Redis for session storage
   - Cache role permissions

4. **Bundle Size**
   - Tree-shaking enabled in TypeScript
   - Exclude test files from builds
   - Minimize dependencies

## Debugging Tips

### Enable Debug Logging

```typescript
// In your app
import { Logger } from '@nestjs/common';

const app = await NestFactory.create(AppModule, {
  logger: ['error', 'warn', 'log', 'debug', 'verbose'],
});
```

### Debug Tests

```bash
# Node inspector
yarn test:debug

# VS Code launch.json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Debug",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal",
  "internalConsoleOptions": "neverOpen"
}
```

### Common Issues

1. **Module not found errors**
   - Run `yarn build` to compile TypeScript
   - Check `tsconfig.json` paths configuration
   - Ensure workspace dependencies are linked

2. **Test failures**
   - Clear Jest cache: `jest --clearCache`
   - Check test database setup
   - Verify fixtures are up to date

3. **TypeORM errors**
   - Check entity decorators
   - Verify database connection config
   - Check migration status

## Best Practices

1. **Security**
   - Always validate user input (class-validator)
   - Use guards for protected routes
   - Implement rate limiting
   - Hash passwords (never store plain text)
   - Use environment variables for secrets

2. **Code Quality**
   - Follow NestJS conventions
   - Use dependency injection
   - Write tests for new features
   - Use TypeScript strict mode
   - Document public APIs with JSDoc

3. **Error Handling**
   - Use NestJS exception filters
   - Provide meaningful error messages
   - Log errors with context
   - Don't expose stack traces in production

4. **Performance**
   - Use database indexes
   - Implement pagination
   - Cache frequently accessed data
   - Use async/await properly
   - Monitor database query performance

## Resources

- **NestJS Docs:** https://docs.nestjs.com
- **Concepta Modules:** https://github.com/btwld/nestjs-modules
- **TypeORM Docs:** https://typeorm.io
- **Passport Docs:** https://www.passportjs.org
- **Repository:** https://github.com/conceptadev/rockets

---

**Note:** This document should be updated when significant architectural changes occur, new patterns are introduced, or when moving from alpha to beta/production.
