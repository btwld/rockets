# Rockets Stack — Design Specification

## Package Hierarchy

```
@bitwild/rockets-common          Foundation: hooks, nestjs-common, swagger-ui re-exports, shared utils
    ▲
@bitwild/rockets-repository      Abstract repository (RepositoryModule, no TypeORM)
@bitwild/rockets-crud            CRUD module (CrudModule, handlers, adapters, decorators)
@bitwild/rockets-access-control  ACL/RBAC (AccessControlModule, guards, decorators)
    ▲
@bitwild/rockets-core            Integrator: auth, guard, CQRS, resources, context overlay
    ▲
@bitwild/rockets                 Composition root: MeController, Swagger, APP_GUARD, settings
    ▲
Consumer App                     AppModule → RocketsModule.forRoot/forRootAsync
```

**Rule:** Only leaf packages (`common`, `repository`, `crud`, `access-control`) have `@concepta/*` dependencies. `rockets-core` and `rockets` have ZERO `@concepta/*` deps.

---

## Package Responsibilities

### rockets-common (`@bitwild/rockets-common`)
- Re-exports from `@concepta/nestjs-hook`, `@concepta/nestjs-common`, `@concepta/nestjs-swagger-ui`
- Shared utils: `error-logging.helper`, `createRepositoryContext`
- No domain logic, no entities

### rockets-repository (`@bitwild/rockets-repository`)
- Re-exports `@concepta/nestjs-repository` (abstract layer only)
- DB adapters (TypeORM, Firestore) are consumer-level dependencies

### rockets-crud (`@bitwild/rockets-crud`)
- Re-exports `@concepta/nestjs-crud`
- Also exports base handler classes: `CrudQueryHandler`, `CrudCommandHandler`, `CrudWithBodyCommandHandler`

### rockets-access-control (`@bitwild/rockets-access-control`)
- Re-exports `@concepta/nestjs-access-control`

### rockets-core (`@bitwild/rockets-core`)
Registers (global):
- `CqrsModule.forRoot()`
- `ConfigModule.forFeature()`
- `RepositoryModule.forRoot()` + per-persistence `forFeature()`
- `CrudModule.forRoot()` + per-resource `forFeature()`
- `AUTH_ADAPTER_TOKEN` — from options.authProvider
- `AuthServerGuard` — injects AUTH_ADAPTER_TOKEN
- `AuthorizedUserOverlay` — APP_INTERCEPTOR, attaches `request.user` to context overlay
- UserMetadata CQRS handlers (overridable)
- Per-resource providers (auto-extracted from operations + declared)

Exports:
- Auth contracts: `AuthAdapterInterface`, `AuthorizedUser`
- Guard: `AuthServerGuard`, `AuthPublic`, `ROCKETS_DISABLE_GUARDS_TOKEN`
- Context: `AuthorizedUserCtx`, `AuthorizedUserOverlay`, `getAuthorizedUserFromCrudContext`
- User/Metadata interfaces, DTOs, CQRS commands/queries/handlers
- Resource config: `RocketsResourceConfig`

### rockets (server) (`@bitwild/rockets`)
Registers:
- `RocketsCoreModule.forRootAsync()` — delegates to core with authProvider from RAW_OPTIONS_TOKEN
- `SwaggerUiModule.registerAsync()` — Swagger is server-level, not core
- `MeController` — `/me` GET + PATCH
- `APP_GUARD` → `AuthServerGuard` (opt-in via `enableGlobalGuard`)
- Settings provider

Re-exports everything from core for consumer convenience.

---

## Consumer Configuration

```typescript
@Module({
  imports: [
    TypeOrmModule.forRoot({ ... }),
    AuthModule,  // provides SampleAuthAdapter
    RocketsModule.forRootAsync({
      imports: [AuthModule],
      inject: [SampleAuthAdapter],
      useFactory: (authProvider) => ({
        authProvider,                    // → core registers AUTH_ADAPTER_TOKEN
        userMetadata: {                  // → server uses for MeController
          createDto: UserMetadataCreateDto,
          updateDto: UserMetadataUpdateDto,
        },
      }),
      // Structural (extras):
      repositoryPersistence: [           // → core calls RepositoryModule.forFeature per entry
        {
          module: TypeOrmRepositoryModule,
          entities: [
            { key: 'userMetadata', entity: UserMetadataEntity },
            { key: 'pet', entity: PetEntity },
          ],
        },
      ],
      resources: [                       // → core calls CrudModule.forFeature per resource
        createPetResource(),
        createPetVaccinationResource(),
      ],
    }),
  ],
})
export class AppModule {}
```

---

## Resource Pattern

Each resource is a factory function returning `RocketsResourceConfig` (extends `CrudModuleForFeatureOptionsInterface`):

```typescript
// resources/pet/pet.resource.ts
export function createPetResource(): RocketsResourceConfig {
  return {
    crud: {
      controller: {
        path: 'pets',
        entity: 'pet',
        resolver: CrudOperationResolver,
        response: { resource: PetResponseDto, paginated: PetPaginatedDto },
        extraDecorators: [ApiBearerAuth(), ApiTags('Pets')],
      },
      operations: [
        { operation: Operation.List, query: CrudListQuery },
        { operation: Operation.Read, query: CrudReadQuery },
        {
          operation: Operation.Create,
          request: { body: PetCreateDto },
          command: CrudCreateCommand,
          commandHandler: PetCreateHandler,  // custom handler override
        },
        ...
      ],
    },
    providers: [PetCreateHandler],  // registered + exported by core
  };
}
```

### Folder structure
```
src/resources/
  pet/
    pet.resource.ts              ← factory function
    pet.entity.ts                ← TypeORM entity
    pet.dto.ts                   ← Create, Update, Response, Paginated DTOs
    pet-create.handler.ts        ← custom handler (optional)
    index.ts                     ← re-exports
  pet-vaccination/
    pet-vaccination.resource.ts
    pet-vaccination.entity.ts
    pet-vaccination.dto.ts
    index.ts
```

---

## Auth Flow

```
Request → AuthServerGuard (APP_GUARD)
  │        validates token via AuthAdapterInterface.validateToken()
  │        sets request.user = AuthorizedUser
  ▼
AuthorizedUserOverlay (APP_INTERCEPTOR)
  │        reads request.user
  │        attaches to AppContextHost via defineOverlay(AuthorizedUserCtx, user)
  ▼
CrudContextOverlay (APP_INTERCEPTOR, from CrudModule)
  │        builds CrudContextInterface (entity, operation, params, query)
  │        skips non-CRUD controllers (fix in nestjs-crud PR #461)
  ▼
Controller / CRUD Handler
  │        accesses user via getAuthorizedUserFromCrudContext(context)
  │        or via @Ctx() ctx → ctx.with(AuthorizedUserCtx)
  ▼
Response → CrudSerializeInterceptor → DTO serialization
```

## Context Overlay System

The `@concepta/nestjs-common` Context Overlay System provides typed, per-request context.

### Define overlay
```typescript
export const AuthorizedUserCtx = new OverlayRef<'withAuthorizedUser', AuthorizedUser>(
  'withAuthorizedUser',
);
```

### Attach in interceptor
```typescript
@Injectable()
export class AuthorizedUserOverlay extends ContextOverlayInterceptor {
  readonly ref = AuthorizedUserCtx;

  attach(context: ExecutionContext): void {
    const req = context.switchToHttp().getRequest();
    if (!req.user) return;
    getAppContext(req).defineOverlay(this.ref, req.user);
  }
}
```

### Read in handler
```typescript
const authUser = getAuthorizedUserFromCrudContext(context);
// or directly:
const appCtx = getAppContext(context.httpRequest);
const user = appCtx.supports(AuthorizedUserCtx)
  ? appCtx.with(AuthorizedUserCtx)
  : undefined;
```

---

## Data Flow: RocketsModule.forRoot → Core

```
RocketsModule.forRoot(options)
  │
  └── definitionTransform(definition, extras)
        │
        ├── createRocketsImports():
        │     └── RocketsCoreModule.forRootAsync({
        │           inject: [RAW_OPTIONS_TOKEN],
        │           useFactory: (opts) => ({ authProvider: opts.authProvider }),
        │           repositoryPersistence: extras.repositoryPersistence,
        │           resources: extras.resources,
        │           handlers: extras.handlers,
        │         })
        │     └── SwaggerUiModule.registerAsync(...)
        │
        ├── createRocketsControllers():
        │     └── MeController (unless disabled)
        │
        ├── createRocketsProviders():
        │     └── settings, APP_GUARD
        │
        └── createRocketsExports():
              └── RAW_OPTIONS_TOKEN, ROCKETS_CORE_SETTINGS_TOKEN
```

## Data Flow: Core Module Definition

```
RocketsCoreModule.forRoot/forRootAsync(options)
  │
  └── definitionTransform(definition, extras)
        │
        ├── createCoreImports(extras):
        │     ├── CqrsModule.forRoot()
        │     ├── ConfigModule.forFeature()
        │     ├── RepositoryModule.forRoot({})
        │     ├── for each repositoryPersistence:
        │     │     └── RepositoryModule.forFeature(persistence)
        │     └── if resources:
        │           ├── CrudModule.forRoot({})
        │           └── for each resource:
        │                 └── CrudModule.forFeature(resource)
        │
        ├── createCoreProviders():
        │     ├── settings, Reflector
        │     ├── AUTH_ADAPTER_TOKEN ← opts.authProvider
        │     ├── AuthServerGuard
        │     ├── APP_INTERCEPTOR → AuthorizedUserOverlay
        │     ├── UserMetadata handlers (overridable)
        │     └── extractResourceProviders():
        │           ├── auto-extract queryHandler/commandHandler from operations
        │           └── resource.providers
        │
        └── createCoreExports():
              ├── ConfigModule, RAW_OPTIONS_TOKEN, AUTH_ADAPTER_TOKEN, etc.
              └── resource providers (globally available)
```

---

## Key Interfaces

### RocketsResourceConfig
```typescript
interface RocketsResourceConfig extends CrudModuleForFeatureOptionsInterface {
  readonly providers?: Provider[];
}
// Inherits: { crud: { controller, operations } }
```

### RocketsCoreOptionsInterface
```typescript
interface RocketsCoreOptionsInterface {
  readonly authProvider: AuthAdapterInterface;
  readonly settings?: RocketsCoreSettingsInterface;
}
```

### RocketsCoreOptionsExtrasInterface
```typescript
interface RocketsCoreOptionsExtrasInterface extends Pick<DynamicModule, 'global'> {
  readonly repositoryPersistence?: ReadonlyArray<RepositoryPersistenceConfig>;
  readonly providers?: Provider[];
  readonly resources?: ReadonlyArray<RocketsResourceConfig>;
  readonly handlers?: {
    readonly upsertUserMetadata?: Type<AbstractUpsertUserMetadataHandler>;
    readonly getUserMetadata?: Type<AbstractGetUserMetadataHandler>;
  };
}
```

### AuthAdapterInterface
```typescript
interface AuthAdapterInterface {
  validateToken(token: string): Promise<AuthorizedUser>;
}
```

### AuthorizedUser
```typescript
interface AuthorizedUser {
  id: string;
  sub: string;
  email?: string;
  userRoles?: { role: { name: string } }[];
  claims?: Record<string, unknown>;
}
```
