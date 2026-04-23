# User Bounded Context — DDD + CQRS Implementation Plan

**Pacote:** `rockets-server-auth/src/domains/user/`
**Data:** 2026-03-20
**Referencia:** `nestjs-modules/packages/nestjs-user` (v8 DDD pattern)

---

## 1. Objetivo

Migrar o user bounded context de "tudo inline no module" para DDD com CQRS.
Hoje a logica de negocio vive dentro de classes anonimas criadas em
`register()` dos
modules (signup e admin). A nova arquitetura separa em 4 camadas com comandos,
queries, eventos e repositorios — todos recebendo `ctx` para suporte a
transacao.

---

## 2. Operacoes de Negocio do User

| Operacao | Endpoint | Quem | Command/Query |
|---|---|---|---|
| Signup | `POST /signup` | Publico | `SignupUserCommand` |
| Update user | `PATCH /admin/users/:id` | Admin | `UpdateUserCommand` |
| Remove user | `DELETE /admin/users/:id` | Admin | `RemoveUserCommand` |
| Get user | `GET /admin/users/:id` | Admin | `GetUserQuery` |
| List users | `GET /admin/users` | Admin | `GetUsersQuery` |

**Regra:** Commands/Queries sao genericos (sem prefixo admin). O contexto de
caller (guard, auth) vive nos gateways.

---

## 3. Folder Structure

```text
user/                                    # BOUNDED CONTEXT: User
├── domain/                              # Pure business logic
│   ├── events/
│   │   ├── user-signed-up.event.ts      # After public signup
│   │   └── user-updated.event.ts        # After any user update
│   ├── exceptions/
│   │   ├── duplicate-user.exception.ts
│   │   └── user-metadata.exception.ts   # MOVED from domains/user/
│   └── interfaces/                      # KEEP existing interfaces
│
├── application/                         # CQRS handlers (pure operations)
│   ├── commands/
│   │   ├── impl/
│   │   │   ├── signup-user.command.ts    # Public signup
│   │   │   ├── update-user.command.ts    # Update user (any caller)
│   │   │   └── remove-user.command.ts    # Remove user (any caller)
│   │   └── handlers/
│   │       ├── signup-user.handler.ts    # txScope + repo + eventPublisher (DDD_REFERENCE pattern)
│   │       ├── update-user.handler.ts    # Generic update handler
│   │       └── remove-user.handler.ts    # Generic remove handler
│   ├── queries/
│   │   ├── impl/
│   │   │   ├── get-user.query.ts
│   │   │   └── get-users.query.ts
│   │   └── handlers/
│   │       ├── get-user.handler.ts
│   │       └── get-users.handler.ts
│   ├── listeners/
│   │   └── assign-default-role.listener.ts  # Reacts to UserSignedUpEvent
│
├── infrastructure/                      # InjectDynamicRepository + Where
│   └── persistence/
│       └── user.repository.ts
│
├── gateways/                            # HTTP adapters — caller context HERE
│   └── http/
│       ├── admin/                       # Admin-specific gateway
│       │   ├── admin-update-user.request-handler.ts   # AdminGuard + UpdateUserCommand
│       │   ├── admin-remove-user.request-handler.ts   # AdminGuard + RemoveUserCommand
│       │   └── admin-list-users.request-handler.ts    # AdminGuard + GetUsersQuery
│       └── signup/                      # Public gateway
│           └── signup-user.request-handler.ts         # Public + SignupUserCommand
│
├── constants/                           (existente — manter)
├── dto/                                 (existente — manter)
├── interfaces/                          (existente — manter)
├── services/                            (existente — manter GenericUserMetadataModelService)
└── modules/
    ├── rockets-auth-signup.module.ts     (reescrever)
    └── rockets-auth-admin.module.ts      (reescrever)
```

---

## 4. Fluxo de Dados

```text
POST /signup { email, username, password, userMetadata }
     │
  Gateway: signup-user.request-handler.ts
     │ @AuthPublic() · Valida DTO · Traduz para Command
     │
     ▼
  commandBus.execute(new SignupUserCommand(ctx, dto))
     │
  Handler: signup-user.handler.ts
     │ txScope.run(ctx, async (trx) => { ... })
     │
     ├─ 1. userRepo.findByEmail(ctx, email)        # uniqueness check
     ├─ 2. userRepo.findByUsername(ctx, username)    # uniqueness check
     ├─ 3. passwordCreationService.create(password)  # hash
     ├─ 4. eventPublisher.mergeObjectContext(User.create(eventCtx, dto))
     ├─ 5. userRepo.save(ctx, aggregate)             # persist user
     ├─ 6. metadataRepo.save(ctx, metadata)          # metadata (same TX)
     ├─ 7. trx.onCommit → agg.commit()              # publish UserSignedUpEvent
     ├─ 8. trx.onRollback → agg.uncommit()          # discard events
     └─ return agg.toPlain() + userMetadata
           │
           ▼ (listener reacts async)
  assign-default-role.listener.ts
     └─ roleService.assignDefaultRole(userId)
```

```text
PATCH /admin/users/:id { username, active, userMetadata }
     │
  Gateway: admin-update-user.request-handler.ts
     │ @AdminGuard · @ApiBearerAuth · Valida DTO
     │
     ▼
  commandBus.execute(new UpdateUserCommand(ctx, id, dto))
     │
  Handler: update-user.handler.ts
     │
     ├─ 1. userRepo.findById(ctx, id)               # exists?
     ├─ 2. userRepo.update(ctx, id, userdata)        # persist
     ├─ 3. metadataRepo.createOrUpdate(ctx, ...)     # metadata (same TX)
     ├─ 4. eventBus.publish(UserUpdatedEvent)        # domain event
     └─ return updated user with metadata
```

---

## 5. Type Alignment

### What comes from nestjs-user v8 (DO NOT duplicate)

| Export | Type | Used in signup as |
|---|---|---|
| `User` | Aggregate class | `User.create(eventCtx, dto)` → aggregate with `.toPlain()` |
| `UserRepositoryInterface` | `{ get(ctx,id), findByEmail(ctx,email), findByUsername(ctx,username), save(ctx,user): void, remove(ctx,user): void }` | Uniqueness check + persist |
| `UserRepository` | Implementation wrapping `RepositoryInterface<UserEntityInterface>` + `UserMapper` | Provider via factory |
| `UserMapper` | `DomainMapper<UserEntityInterface, UserInterface, User>` | Required by UserRepository |
| `createUserRepositoryProvider(entityKey, customRepo?)` | Factory returning `Provider[]` | Module wiring |
| `USER_REPOSITORY_TOKEN` | `'USER_REPOSITORY_TOKEN'` (string, NOT symbol) | `@Inject(USER_REPOSITORY_TOKEN)` |
| `CreateUserCommand` | `{ ctx: RepositoryContextInterface, dto: UserCreatableInterface }` | Dispatch via CommandBus |
| `CreateUserHandler` | Handles `CreateUserCommand` with txScope | User creation + credentials |
| `UserCreatedEvent` | `{ eventContext, user: UserInterface }` | Emitted by `User.create()` |

### Key type facts

```text
UserCreatableInterface = {
  username: string       // REQUIRED
  email: string          // REQUIRED
  active?: boolean       // OPTIONAL (default true)
  password?: string      // OPTIONAL
}

User.toPlain() returns = {
  id: string
  version: number
  email: string
  username: string
  active: boolean
  dateCreated: Date
  dateUpdated: Date
  dateDeleted: Date | null
}
// Note: NO password fields, NO userMetadata — those are added by the handler

UserRepositoryInterface.save(ctx, user) → Promise<void>
// Returns void! Handler uses user.toPlain() for response, NOT save() return.

UserRepositoryInterface.findByEmail(ctx, email) → Promise<User | null>
// Returns null if not found. Handler throws DuplicateUserException.
```

### What lives in rockets-server-auth (signup-specific)

| What | Why not in nestjs-user |
|---|---|
| `DuplicateUserException` | Uniqueness is a signup rule, not a generic user rule |
| `UserMetadataRepositoryInterface` | Metadata is rockets-specific, not in nestjs-user |
| `SignupUserCommand` | Extends UserCreatableInterface with `userMetadata` field |
| `SignupUserHandler` | Orchestrates: uniqueness + user creation + metadata + role event |
| `AssignDefaultRoleListener` | Role assignment is rockets-specific |

### Response shape alignment

E2e test expects:

```json
{
  "id": "uuid",
  "username": "signupuser",
  "email": "signupuser@example.com",
  "active": true,
  "dateCreated": "2026-...",
  "dateUpdated": "2026-...",
  "version": 1,
  "userMetadata": { ... }  // only when metadata provided
}
```

Handler builds this as: `{ ...user.toPlain(), userMetadata }`

Password fields (`password`, `passwordHash`, `passwordSalt`) are NOT in
`User.toPlain()` because `UserInterface` only has `{email, username, active}`.
The password is handled by `CreateUserCredentialCommand` in nestjs-user v8
(separate aggregate).

---

## 6. Code Samples

### 6.1 Domain Layer (rockets-specific only)

#### `domain/exceptions/duplicate-user.exception.ts`

Follows the same `RuntimeException` pattern used in `user-metadata.exception.ts`:

```typescript
import { HttpStatus } from '@nestjs/common';
import {
  RuntimeException,
  RuntimeExceptionOptions,
} from '@concepta/nestjs-common';

export class UserException extends RuntimeException {
  constructor(message: string, options?: RuntimeExceptionOptions) {
    super({ message, ...options });
    this.errorCode = 'USER_ERROR';
  }
}

export class DuplicateUserException extends UserException {
  constructor(options?: RuntimeExceptionOptions) {
    super('User with this username or email already exists', {
      httpStatus: HttpStatus.BAD_REQUEST,
      ...options,
    });
    this.errorCode = 'USER_DUPLICATE_ERROR';
  }
}
```

### 6.2 Infrastructure Layer

**UserRepository, UserMapper, createUserRepositoryProvider** — all come from
`@concepta/nestjs-user`. No local implementation needed.

**UserMetadataRepository** — rockets-specific, wraps metadata
`RepositoryInterface`:

#### `domain/repositories/user-metadata-repository.interface.ts`

```typescript
import { RepositoryContextInterface } from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataEntityInterface } from '../../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../interfaces/rockets-auth-user-metadata-updatable.interface';

export interface UserMetadataRepositoryInterface {
  findByUserId(
    ctx: RepositoryContextInterface,
    userId: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface | null>;

  createOrUpdate(
    ctx: RepositoryContextInterface,
    userId: string,
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface>;
}
```

#### `infrastructure/persistence/user-metadata.repository.ts`

```typescript
import {
  RepositoryContextInterface,
  RepositoryInterface,
  Where,
} from '@concepta/nestjs-common';
import { UserMetadataRepositoryInterface } from '../../domain/repositories/user-metadata-repository.interface';
import { RocketsAuthUserMetadataEntityInterface } from '../../interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../interfaces/rockets-auth-user-metadata-updatable.interface';

export class UserMetadataRepository implements UserMetadataRepositoryInterface {
  constructor(
    private readonly repository: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
  ) {}

  async findByUserId(
    ctx: RepositoryContextInterface,
    userId: string,
  ): Promise<RocketsAuthUserMetadataEntityInterface | null> {
    return this.repository.findOne({
      where: Where.eq('userId', userId),
      ctx,
    });
  }

  async createOrUpdate(
    ctx: RepositoryContextInterface,
    userId: string,
    data: RocketsAuthUserMetadataUpdatableInterface,
  ): Promise<RocketsAuthUserMetadataEntityInterface> {
    const existing = await this.findByUserId(ctx, userId);
    if (existing) {
      return this.repository.update(existing, data, { ctx });
    }
    return this.repository.create({ ...data, userId }, { ctx });
  }
}
```

### 6.3 Application Layer

#### `application/commands/impl/signup-user.command.ts`

```typescript
import {
  RepositoryContextInterface,
  UserCreatableInterface,
} from '@concepta/nestjs-common';

export interface SignupUserDto extends UserCreatableInterface {
  userMetadata?: Record<string, unknown>;
}

export class SignupUserCommand {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly dto: SignupUserDto,
  ) {}
}
```

Note: `UserCreatableInterface` already includes `password?: string` via `Partial<PasswordPlainInterface>`.

#### `application/commands/impl/update-user.command.ts`

```typescript
import {
  ReferenceId,
  RepositoryContextInterface,
  UserUpdatableInterface,
} from '@concepta/nestjs-common';

export interface UpdateUserDto extends Partial<UserUpdatableInterface> {
  userMetadata?: Record<string, unknown>;
}

export class UpdateUserCommand {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly id: ReferenceId,
    public readonly dto: UpdateUserDto,
  ) {}
}
```

#### `application/commands/impl/remove-user.command.ts`

```typescript
import { ReferenceId, RepositoryContextInterface } from '@concepta/nestjs-common';

export class RemoveUserCommand {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly id: ReferenceId,
  ) {}
}
```

#### `application/queries/impl/get-user.query.ts`

```typescript
import { ReferenceId, RepositoryContextInterface } from '@concepta/nestjs-common';

export class GetUserQuery {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly id: ReferenceId,
  ) {}
}
```

#### `application/queries/impl/get-users.query.ts`

```typescript
import { RepositoryContextInterface } from '@concepta/nestjs-common';

export class GetUsersQuery {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly options?: { where?: any; skip?: number; take?: number },
  ) {}
}
```

#### `application/commands/handlers/signup-user.handler.ts`

Follows DDD_REFERENCE pattern. Uses `User` aggregate and
`UserRepositoryInterface` from `@concepta/nestjs-user`.

```typescript
import { Inject, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import {
  EntityHeaderInterface,
  EventContextHost,
  RepositoryContextInterface,
} from '@concepta/nestjs-common';
import { TransactionScope } from '@concepta/nestjs-repository';
import {
  User,
  UserRepositoryInterface,
  USER_REPOSITORY_TOKEN,
  CreateUserCommand,
} from '@concepta/nestjs-user';

import { SignupUserCommand } from '../impl/signup-user.command';
import { DuplicateUserException } from '../../../domain/exceptions/duplicate-user.exception';
import { USER_METADATA_REPOSITORY_TOKEN } from '../../../infrastructure/config/user-domain.constants';
import { UserMetadataRepositoryInterface } from '../../../domain/repositories/user-metadata-repository.interface';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

@CommandHandler(SignupUserCommand)
export class SignupUserHandler
  implements ICommandHandler<SignupUserCommand>
{
  private readonly logger = new Logger(SignupUserHandler.name);

  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: UserRepositoryInterface,
    @Inject(USER_METADATA_REPOSITORY_TOKEN)
    private readonly metadataRepository: UserMetadataRepositoryInterface,
    private readonly commandBus: CommandBus,
    private readonly txScope: TransactionScope,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(
    command: SignupUserCommand,
  ): Promise<RocketsAuthUserEntityInterface> {
    const { ctx, dto } = command;

    // 1. Uniqueness check (before TX — read-only)
    await this.ensureUnique(ctx, dto.email, dto.username);

    // 2. All mutations inside TX
    return this.txScope.run(ctx, async (trx) => {
      // Create user via nestjs-user's CreateUserCommand
      // This handles: User.create() + save + password credentials + events
      const user = await this.commandBus.execute<CreateUserCommand, User>(
        new CreateUserCommand(ctx, {
          email: dto.email,
          username: dto.username,
          active: dto.active,
          password: dto.password,
        }),
      );
      // CreateUserCommand joins this TX because ctx already has trx

      // Persist metadata (same TX via ctx)
      let userMetadata;
      if (dto.userMetadata) {
        const { id, userId, ...safeMetadata } = dto.userMetadata;
        if (id || userId) {
          this.logger.warn('Ignoring id/userId from metadata payload');
        }
        userMetadata = await this.metadataRepository.createOrUpdate(
          ctx,
          user.id,
          safeMetadata,
        );
      }

      // Return response (user.toPlain() has {id, version, email, username, active, dates})
      return {
        ...user.toPlain(),
        userMetadata,
      } as RocketsAuthUserEntityInterface;
    });
    // If anything throws → TX rollback (user + metadata + credentials)
  }

  private async ensureUnique(
    ctx: RepositoryContextInterface,
    email: string,
    username: string,
  ): Promise<void> {
    const byEmail = await this.userRepository.findByEmail(ctx, email);
    if (byEmail) throw new DuplicateUserException();

    const byUsername = await this.userRepository.findByUsername(ctx, username);
    if (byUsername) throw new DuplicateUserException();
  }
}
```

**Key differences from old code:**

- `User.create()` + password handled by `CreateUserCommand` (nestjs-user v8) —
  no `passwordCreationService.create()` here
- `UserRepositoryInterface` from nestjs-user — not a local wrapper
- `save()` returns `void` → response built from `user.toPlain()`
- `CreateUserCommand` joins outer TX (TransactionScope nesting)
- No manual rollback — TX handles it

#### `application/commands/handlers/update-user.handler.ts`

Uses `User` aggregate from nestjs-user v8 with `user.update()` + `repo.save()`.

```typescript
import { Inject } from '@nestjs/common';
import { CommandHandler, EventPublisher, ICommandHandler } from '@nestjs/cqrs';
import {
  EntityHeaderInterface,
  EventContextHost,
} from '@concepta/nestjs-common';
import { TransactionScope } from '@concepta/nestjs-repository';
import {
  User,
  UserRepositoryInterface,
  USER_REPOSITORY_TOKEN,
  UserNotFoundException,
} from '@concepta/nestjs-user';

import { UpdateUserCommand } from '../impl/update-user.command';
import { USER_METADATA_REPOSITORY_TOKEN } from '../../../infrastructure/config/user-domain.constants';
import { UserMetadataRepositoryInterface } from '../../../domain/repositories/user-metadata-repository.interface';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand> {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: UserRepositoryInterface,
    @Inject(USER_METADATA_REPOSITORY_TOKEN)
    private readonly metadataRepository: UserMetadataRepositoryInterface,
    private readonly txScope: TransactionScope,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(command: UpdateUserCommand): Promise<RocketsAuthUserEntityInterface> {
    const { ctx, id, dto } = command;
    const { userMetadata, ...userData } = dto;

    const existing = await this.userRepository.get(ctx, id);
    if (!existing) throw new UserNotFoundException(String(id));

    const eventContext = EventContextHost.builder<EntityHeaderInterface>()
      .setHeader('entity', 'user')
      .build();

    return this.txScope.run(ctx, async (trx) => {
      const user = this.eventPublisher.mergeObjectContext(existing);
      user.update(eventContext, userData);
      await this.userRepository.save(ctx, user);

      let metadata;
      if (userMetadata && Object.keys(userMetadata).length > 0) {
        metadata = await this.metadataRepository.createOrUpdate(ctx, String(id), userMetadata);
      }

      trx.onCommit(ctx, () => user.commit());
      trx.onRollback(ctx, () => user.uncommit());

      return { ...user.toPlain(), userMetadata: metadata } as RocketsAuthUserEntityInterface;
    });
  }
}
```

#### `application/commands/handlers/remove-user.handler.ts`

```typescript
import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { TransactionScope } from '@concepta/nestjs-repository';
import {
  UserRepositoryInterface,
  USER_REPOSITORY_TOKEN,
  UserNotFoundException,
} from '@concepta/nestjs-user';

import { RemoveUserCommand } from '../impl/remove-user.command';

@CommandHandler(RemoveUserCommand)
export class RemoveUserHandler implements ICommandHandler<RemoveUserCommand> {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: UserRepositoryInterface,
    private readonly txScope: TransactionScope,
  ) {}

  async execute(command: RemoveUserCommand): Promise<void> {
    const { ctx, id } = command;
    const existing = await this.userRepository.get(ctx, id);
    if (!existing) throw new UserNotFoundException(String(id));

    return this.txScope.run(ctx, async () => {
      await this.userRepository.remove(ctx, existing);
    });
  }
}
```

#### `application/queries/handlers/get-user.handler.ts`

```typescript
import { Inject } from '@nestjs/common';
import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import {
  User,
  UserRepositoryInterface,
  USER_REPOSITORY_TOKEN,
  UserNotFoundException,
} from '@concepta/nestjs-user';

import { GetUserQuery } from '../impl/get-user.query';

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery> {
  constructor(
    @Inject(USER_REPOSITORY_TOKEN)
    private readonly userRepository: UserRepositoryInterface,
  ) {}

  async execute(query: GetUserQuery): Promise<User> {
    const user = await this.userRepository.get(query.ctx, query.id);
    if (!user) throw new UserNotFoundException(String(query.id));
    return user;
  }
}
```

#### `application/queries/handlers/get-users.handler.ts`

Note: `UserRepositoryInterface` from nestjs-user v8 doesn't have a `findMany`.
For listing, we need to extend the interface or use the underlying repository
directly. This will be defined in Phase 2.

```typescript
// TODO: Phase 2 — define list query pattern
// Options: extend UserRepositoryInterface or add a separate read-model query
```

#### `application/listeners/assign-default-role.listener.ts`

```typescript
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';

import { UserSignedUpEvent } from '../../domain/events/user-signed-up.event';
import { RocketsAuthRoleService } from '../../../role/services/rockets-auth-role.service';

@EventsHandler(UserSignedUpEvent)
export class AssignDefaultRoleListener implements IEventHandler<UserSignedUpEvent> {
  private readonly logger = new Logger(AssignDefaultRoleListener.name);

  constructor(private readonly roleService: RocketsAuthRoleService) {}

  handle(event: UserSignedUpEvent): void {
    this.roleService
      .assignDefaultRoleToUser(event.userId, false)
      .catch((err) => {
        this.logger.error('Failed to assign default role', {
          userId: event.userId,
          error: err,
        });
      });
  }
}
```

### 6.4 Gateway Layer

#### `gateways/http/signup/signup-user.request-handler.ts`

```typescript
import {
  Body,
  Controller,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthPublic } from '@concepta/nestjs-authentication';

import { RocketsAuthUserCreateDto } from '../../../dto/rockets-auth-user-create.dto';
import { RocketsAuthUserDto } from '../../../dto/rockets-auth-user.dto';
import { SignupUserCommand } from '../../../application/commands/impl/signup-user.command';

@Controller('signup')
@ApiTags('auth')
export class SignupUserRequestHandler {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @AuthPublic()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: false }))
  @ApiOperation({ summary: 'Create a new user account' })
  @ApiBody({ type: RocketsAuthUserCreateDto })
  @ApiCreatedResponse({ type: RocketsAuthUserDto })
  async createOne(@Body() dto: any, @Req() req: any) {
    return this.commandBus.execute(
      new SignupUserCommand(req, {
        email: dto.email,
        username: dto.username,
        password: dto.password,
        active: dto.active,
        userMetadata: dto.userMetadata,
      }),
    );
  }
}
```

#### `gateways/http/admin/admin-update-user.request-handler.ts`

```typescript
import {
  Body,
  Controller,
  Param,
  Patch,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from '../../../../guards/admin.guard';
import { UpdateUserCommand } from '../../../application/commands/impl/update-user.command';

@Controller('admin/users')
@ApiTags('admin')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminUpdateUserRequestHandler {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch(':id')
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateOne(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    return this.commandBus.execute(new UpdateUserCommand(req, id, dto));
  }
}
```

#### `gateways/http/admin/admin-list-users.request-handler.ts`

```typescript
import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from '../../../../guards/admin.guard';
import { GetUsersQuery } from '../../../application/queries/impl/get-users.query';
import { GetUserQuery } from '../../../application/queries/impl/get-user.query';

@Controller('admin/users')
@ApiTags('admin')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminListUsersRequestHandler {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  async getMany(@Req() req: any, @Query() query: any) {
    return this.queryBus.execute(new GetUsersQuery(req, query));
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @Req() req: any) {
    return this.queryBus.execute(new GetUserQuery(req, id));
  }
}
```

#### `gateways/http/admin/admin-remove-user.request-handler.ts`

```typescript
import { Controller, Delete, Param, Req, UseGuards } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from '../../../../guards/admin.guard';
import { RemoveUserCommand } from '../../../application/commands/impl/remove-user.command';

@Controller('admin/users')
@ApiTags('admin')
@UseGuards(AdminGuard)
@ApiBearerAuth()
export class AdminRemoveUserRequestHandler {
  constructor(private readonly commandBus: CommandBus) {}

  @Delete(':id')
  async deleteOne(@Param('id') id: string, @Req() req: any) {
    return this.commandBus.execute(new RemoveUserCommand(req, id));
  }
}
```

### 6.5 Module Wiring

#### `modules/rockets-auth-signup.module.ts`

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { RepositoryModule } from '@concepta/nestjs-repository';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';

import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../constants/user-metadata.constants';

// Application
import { SignupUserHandler } from '../application/commands/handlers/signup-user.handler';
import { AssignDefaultRoleListener } from '../application/listeners/assign-default-role.listener';

// nestjs-user v8: reuse aggregate infra
import {
  UserMapper,
  CreateUserHandler,
  createUserRepositoryProvider,
} from '@concepta/nestjs-user';

// Infrastructure (rockets-specific)
import { UserMetadataRepository } from '../infrastructure/persistence/user-metadata.repository';
import { USER_METADATA_REPOSITORY_TOKEN } from '../infrastructure/config/user-domain.constants';

// Gateway
import { SignupUserRequestHandler } from '../gateways/http/signup/signup-user.request-handler';

@Module({})
export class RocketsAuthSignUpModule {
  static register(admin: UserCrudOptionsExtrasInterface): DynamicModule {
    return {
      module: RocketsAuthSignUpModule,
      imports: [
        ...(admin.imports || []),
        RepositoryModule.forFeature({
          module: TypeOrmRepositoryModule,
          entities: [
            { key: 'user', entity: admin.entity },
            ...(admin.userMetadataConfig
              ? [{ key: USER_METADATA_MODULE_ENTITY_KEY, entity: admin.userMetadataConfig.entity }]
              : []),
          ],
        }),
        CqrsModule.forRoot(),
      ],
      controllers: [SignupUserRequestHandler],
      providers: [
        // nestjs-user v8: aggregate infra (reused, not duplicated)
        UserMapper,
        ...createUserRepositoryProvider('user'),
        CreateUserHandler,
        // rockets-specific: metadata repo
        { provide: USER_METADATA_REPOSITORY_TOKEN, useClass: UserMetadataRepository },
        // Application: command handler + event listener
        SignupUserHandler,
        AssignDefaultRoleListener,
      ],
    };
  }
}
```

#### `modules/rockets-auth-admin.module.ts`

```typescript
import { DynamicModule, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { RepositoryModule } from '@concepta/nestjs-repository';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';

import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../constants/user-metadata.constants';

// Application
import { UpdateUserHandler } from '../application/commands/handlers/update-user.handler';
import { RemoveUserHandler } from '../application/commands/handlers/remove-user.handler';
import { GetUserHandler } from '../application/queries/handlers/get-user.handler';
import { GetUsersHandler } from '../application/queries/handlers/get-users.handler';

// Infrastructure
import { UserRepository } from '../infrastructure/persistence/user.repository';

// Gateways
import { AdminUpdateUserRequestHandler } from '../gateways/http/admin/admin-update-user.request-handler';
import { AdminListUsersRequestHandler } from '../gateways/http/admin/admin-list-users.request-handler';
import { AdminRemoveUserRequestHandler } from '../gateways/http/admin/admin-remove-user.request-handler';

@Module({})
export class RocketsAuthAdminModule {
  static register(admin: UserCrudOptionsExtrasInterface): DynamicModule {
    return {
      module: RocketsAuthAdminModule,
      imports: [
        ...(admin.imports || []),
        RepositoryModule.forFeature({
          module: TypeOrmRepositoryModule,
          entities: [
            { key: 'user', entity: admin.entity },
            ...(admin.userMetadataConfig
              ? [{ key: USER_METADATA_MODULE_ENTITY_KEY, entity: admin.userMetadataConfig.entity }]
              : []),
          ],
        }),
        CqrsModule.forRoot(),
      ],
      controllers: [
        AdminUpdateUserRequestHandler,
        AdminListUsersRequestHandler,
        AdminRemoveUserRequestHandler,
      ],
      providers: [
        UserRepository,
        UpdateUserHandler,
        RemoveUserHandler,
        GetUserHandler,
        GetUsersHandler,
      ],
    };
  }
}
```

---

## 7. O Que Muda vs Hoje

| Antes | Depois |
|---|---|
| Logica inline em `SignupCrudService` dentro de `register()` | `SignupUserHandler` com `txScope.run()` (DDD_REFERENCE pattern) |
| Logica inline em `AdminUserCrudService` dentro de `register()` | `UpdateUserHandler` generico |
| `ConfigurableCrudBuilder` + `CrudService` | Controllers NestJS puros + CommandBus |
| `CrudRelations` + `CrudRelationRegistry` | Metadata via `GenericUserMetadataModelService` (ja existe) |
| Rollback manual (delete user se metadata falha) | TX via `ctx` (quando TransactionScope disponivel) |
| Role assignment inline no handler | Event listener `AssignDefaultRoleListener` (async) |
| `UserModelService.find()` para uniqueness | `UserRepository.findByEmail/Username()` com `Where` |

---

## 8. Package Dependencies — v8.0.0-alpha.2

### Packages to publish (nestjs-modules)

All packages below must be published as `8.0.0-alpha.2` before rockets
implementation starts.

| Package | Version | Changes needed for rockets signup |
|---|---|---|
| `@concepta/nestjs-common` | 8.0.0-alpha.2 | Export `AppContextHost`, `TransactionContextInterface`, `RepositoryContextInterface`, `EventContextHost`, `EntityHeaderInterface`, `UserCreatableInterface`, `UserInterface`, `UserEntityInterface`, `DomainAggregate`, `DomainMapper` |
| `@concepta/nestjs-hook` | 8.0.0-alpha.2 | Dependency of nestjs-repository (no changes) |
| `@concepta/nestjs-repository` | 8.0.0-alpha.2 | Export `TransactionScope`, `RepositoryModule`. Fix `RepositoryModule.forRoot()` to work in test context |
| `@concepta/nestjs-repository-typeorm` | 8.0.0-alpha.2 | Export `TypeOrmRepositoryModule` |
| `@concepta/nestjs-crud` | 8.0.0-alpha.2 | Export `CrudModule`, `CrudAdapter`, `TypeOrmCrudAdapter`, `ConfigurableCrudBuilder` |
| `@concepta/nestjs-cache` | 8.0.0-alpha.2 | Not directly used by signup (no changes) |
| `@concepta/nestjs-otp` | 8.0.0-alpha.2 | Used by auth module (no changes for signup) |
| `@concepta/nestjs-role` | 8.0.0-alpha.2 | Used by `RocketsAuthRoleService`. Needs `RoleModelService`, `RoleService` exports |
| `@concepta/nestjs-user` | 8.0.0-alpha.2 | **Critical** — must export everything below |

### Exports needed from `@concepta/nestjs-user` 8.0.0-alpha.2

Currently NOT exported but required by rockets signup:

```typescript
// Add to nestjs-user/src/index.ts:

// constants (used by @Inject)
export { USER_REPOSITORY_TOKEN, USER_CREDENTIALS_REPOSITORY_TOKEN } from './user.constants';

// infrastructure (used to register providers)
export { UserMapper } from './infrastructure/persistence/user.mapper';
export { createUserRepositoryProvider } from './infrastructure/utils/create-user-repository-provider';

// backward compat services (used by rockets-auth.module-definition.ts)
export { UserModelService } from './services/user-model.service';
export { UserPasswordService } from './services/user-password.service';

// module definition helpers (optional, for advanced wiring)
export { createUserProviders } from './user.module-definition';
```

### rockets-server-auth package.json update

```jsonc
// packages/rockets-server-auth/package.json
{
  "dependencies": {
    "@concepta/nestjs-common": "8.0.0-alpha.2",
    "@concepta/nestjs-crud": "8.0.0-alpha.2",
    "@concepta/nestjs-otp": "8.0.0-alpha.2",
    "@concepta/nestjs-repository": "8.0.0-alpha.2",
    "@concepta/nestjs-repository-typeorm": "8.0.0-alpha.2",
    "@concepta/nestjs-role": "8.0.0-alpha.2",
    "@concepta/nestjs-user": "8.0.0-alpha.2"
    // ... other deps stay as-is
  }
}
```

### Root package.json resolutions

```jsonc
// package.json (root)
{
  "resolutions": {
    "@concepta/nestjs-common": "8.0.0-alpha.2",
    "@concepta/nestjs-crud": "8.0.0-alpha.2",
    "@concepta/nestjs-hook": "8.0.0-alpha.2",
    "@concepta/nestjs-otp": "8.0.0-alpha.2",
    "@concepta/nestjs-repository": "8.0.0-alpha.2",
    "@concepta/nestjs-repository-typeorm": "8.0.0-alpha.2",
    "@concepta/nestjs-role": "8.0.0-alpha.2",
    "@concepta/nestjs-user": "8.0.0-alpha.2",
    "@concepta/nestjs-cache": "8.0.0-alpha.2"
    // ... keep other non-v8 resolutions as 7.0.0-alpha.10
  }
}
```

### Build order for nestjs-modules publish

```text
1. @concepta/nestjs-common        (no deps on other @concepta packages)
2. @concepta/nestjs-hook           (depends on nestjs-common)
3. @concepta/nestjs-repository     (depends on nestjs-common, nestjs-hook)
4. @concepta/nestjs-repository-typeorm (depends on nestjs-repository)
5. @concepta/nestjs-crud           (depends on nestjs-common, nestjs-repository)
6. @concepta/nestjs-cache          (depends on nestjs-common, nestjs-repository)
7. @concepta/nestjs-otp            (depends on nestjs-common, nestjs-repository)
8. @concepta/nestjs-role           (depends on nestjs-common, nestjs-repository)
9. @concepta/nestjs-user           (depends on nestjs-common, nestjs-repository, nestjs-password)
```

---

## 9. Fases de Implementacao

### Fase 0: Publish v8 packages

1. Add missing exports to `@concepta/nestjs-user` index.ts (see section 8)
2. Fix `RepositoryModule.forRoot()` for test context (nestjs-repository)
3. Build all packages in dependency order
4. Publish all as `8.0.0-alpha.2`

### Fase 1: Signup (prioridade)

1. Update rockets `package.json` deps + resolutions to `8.0.0-alpha.2`
2. Criar `domain/exceptions/duplicate-user.exception.ts`
3. Criar `domain/repositories/user-metadata-repository.interface.ts`
4. Criar `infrastructure/persistence/user-metadata.repository.ts`
5. Criar `infrastructure/config/user-domain.constants.ts` (metadata token only,
   user token from nestjs-user)
6. Criar `application/commands/impl/signup-user.command.ts`
7. Criar `application/commands/handlers/signup-user.handler.ts`
8. Criar `application/listeners/assign-default-role.listener.ts`
9. Criar `gateways/http/signup/signup-user.request-handler.ts`
10. Reescrever `modules/rockets-auth-signup.module.ts`
11. Atualizar `modules/rockets-auth-signup.module.e2e-spec.ts`
12. Run `npx tsc --noEmit` → exit 0
13. Run e2e tests → all pass

### Fase 2: Admin

1. Criar `application/commands/` (update-user, remove-user)
2. Criar `application/queries/` (get-user, get-users)
3. Criar `gateways/http/admin/` (update, list, remove request handlers)
4. Reescrever `modules/rockets-auth-admin.module.ts`
5. Testes e2e

### Fase 3: Limpeza

1. Remover `ConfigurableCrudBuilder` usage
2. Remover `CrudService` / `CrudRelationRegistry` / `CrudRelations` imports
3. Mover `user-metadata.exception.ts` para `domain/exceptions/`
4. Atualizar barrel exports em `index.ts`
5. Remove old `commands/signup-create.command.ts` + `signup-create.handler.ts`

---

## 10. Test Impact Analysis

### Signup e2e test (`rockets-auth-signup.module.e2e-spec.ts`)

**Current test setup:** Uses `RocketsAuthModule.forRoot()` which loads ALL
submodules (auth, role, otp, invitation, federated, etc.). This means changing
just the signup module can break compilation if other modules aren't
v8-compatible.

| Test aspect | Impact | Action needed |
|---|---|---|
| **Test setup** (beforeEach) | Uses `RocketsAuthModule.forRoot()` with all submodules | **May need standalone test** — if other modules don't compile with v8, test must import `RocketsAuthSignUpModule.register()` directly instead of full `RocketsAuthModule.forRoot()` |
| **`UserModelService` import** (line 26, 55, 185) | `UserModelService` removed from nestjs-user v8 index | **CHANGE** — replace with `UserRepository` or direct repo query for rollback verification |
| **`userModelService.find()` in rollback test** (line 689) | Used to verify user doesn't exist after rollback | **CHANGE** — use `app.get(getDynamicRepositoryToken('user'))` to query directly |
| **Rollback test assertion** (line 684) | Expects `message: 'Failed to complete signup. Please try again.'` | **CHANGE** — with TX rollback the error message may differ. New handler lets error propagate from metadata repo, TX rollbacks user automatically |
| **Rollback test mock target** (line 663) | Mocks `GenericUserMetadataModelService.createOrUpdate` via `UserMetadataModelService` token | **CHANGE** — new handler uses `UserMetadataRepository` via `USER_METADATA_REPOSITORY_TOKEN`. Mock that instead |
| **`ExceptionsFilter` from nestjs-common** (line 1) | Still exported in v8 | **OK — no change** |
| **`AdminUserTypeOrmCrudAdapter`** (line 10) | Fixture extends `TypeOrmCrudAdapter` from v8 crud | **CHANGE** — fixture must implement new abstract methods from v8 `CrudAdapter` |
| **`userCrud.adapter` in config** (line 93) | Signup module no longer uses adapter (uses UserRepository from nestjs-user) | **CHANGE** — config may still need adapter for admin module, but signup ignores it |
| **`userCrud.entity`** (not in current config) | New signup module needs `entity` for `RepositoryModule.forFeature()` | **ADD** — add `entity: UserFixture` to `userCrud` config |
| **DTO validation tests** (age, firstName, etc.) | These test the NestJS `ValidationPipe` on the DTO | **OK — no change** as long as new controller applies same pipe with same DTO |
| **Duplicate check tests** (lines 416-458) | Tests expect 400 on duplicate username/email | **OK — no change** as long as `DuplicateUserException` produces same HTTP 400 |
| **Response shape tests** (lines 215-227) | Expect `{id, username, email, active, dateCreated, dateUpdated, version}` | **VERIFY** — `User.toPlain()` returns these fields. But `dateDeleted` may also appear (as `null`). Check if test breaks on extra field |
| **Password not exposed** (lines 225-227) | Expect `passwordHash`/`passwordSalt` undefined | **OK** — `User.toPlain()` doesn't include password fields |

### Key changes to signup test

```typescript
// BEFORE (line 26)
import { UserModelService } from '@concepta/nestjs-user';
// AFTER
import { getDynamicRepositoryToken, RepositoryInterface } from '@concepta/nestjs-common';

// BEFORE (line 55)
let userModelService: UserModelService;
// AFTER
let userRepo: RepositoryInterface<any>;

// BEFORE (line 185)
userModelService = app.get(UserModelService);
// AFTER
userRepo = app.get(getDynamicRepositoryToken('user'));

// BEFORE rollback test (line 663)
const metadataService = app.get<GenericUserMetadataModelService>(UserMetadataModelService);
jest.spyOn(metadataService, 'createOrUpdate').mockRejectedValueOnce(...);
// AFTER
import { USER_METADATA_REPOSITORY_TOKEN } from '../infrastructure/config/user-domain.constants';
const metadataRepo = app.get(USER_METADATA_REPOSITORY_TOKEN);
jest.spyOn(metadataRepo, 'createOrUpdate').mockRejectedValueOnce(...);

// BEFORE rollback verify (line 689)
const users = await userModelService.find({ where: { email: '...' } });
// AFTER
const users = await userRepo.find({ where: Where.eq('email', '...') });
```

### Admin e2e test (`rockets-auth-admin.module.e2e-spec.ts`)

**Current test setup:** Uses `AppModuleAdminRelationsFixture` which also loads
full `RocketsAuthModule.forRoot()`.

| Test aspect | Impact | Action needed |
|---|---|---|
| **Full RocketsAuthModule** | Same issue as signup — loads all submodules | **Same risk** — if other modules don't compile with v8, needs standalone test |
| **Admin CRUD operations** (GET, PATCH) | Tests list + update endpoints | **OK — no change** as long as same endpoints exist with same response |
| **Signup in admin test** (line 55-64) | Admin test calls `POST /signup` to create test user | **OK** — if signup works, admin test setup works |
| **Login flow** (line 66-69) | Uses `POST /token/password` | **Not signup-related** — depends on auth module, not user module |
| **Role assignment** (line 75-87) | Uses `RoleService.assignRole()` directly in test | **OK — no change** (test-only, not going through handler) |
| **Update response** (line 128) | Expects `{ active: false, id: userId }` | **VERIFY** — new handler returns `user.toPlain()` which includes all fields. `active` should be in response |
| **List response** (line 108) | Expects 200 with user array | **VERIFY** — new query handler must return same shape |
| **Relation filter** (line 115) | `?filter=userMetadata.firstName` query | **VERIFY** — new implementation may not support CRUD filter syntax. ConfigurableCrudBuilder handled this via CrudRelations. New NestJS controller needs explicit query parsing or this test may need adjustment |

### Admin e2e test — potential issues

1. **Relation filtering** (`?filter=userMetadata.firstName||$contL||`) — the
   current `ConfigurableCrudBuilder` + `CrudRelations` handles this
   automatically. The new pure NestJS controller does NOT have this built-in.
   The test accepts both 200 and 400 (line 119), so it won't break, but the
   feature may be lost until explicitly reimplemented.

2. **Paginated response shape** — current admin uses
   `CrudResponsePaginatedDto` with `AdminUsersPaginatedDto`. New handler returns
   plain array or must implement pagination manually.

### Summary: what tests need

| File | Changes | Risk |
|---|---|---|
| `rockets-auth-signup.module.e2e-spec.ts` | Replace `UserModelService` with repo, change rollback mock target, possibly standalone test setup | **Medium** — mostly import changes |
| `rockets-auth-admin.module.e2e-spec.ts` | Verify response shapes, relation filter may return 400 (already handled) | **Low** — test is tolerant |
| `rockets-auth-admin.relations.e2e-spec.ts` | Relation hydration depends on `CrudRelations` which is removed | **High** — may need rewrite |
| `rockets-auth-admin-complete.e2e-spec.ts` | Full flow test — same concerns as above | **Medium** |
| `rockets-auth-admin-simple.e2e-spec.ts` | Simple CRUD — should work if endpoints match | **Low** |

---

## 11. Verificacao

1. `npx tsc --noEmit -p packages/rockets-server-auth/tsconfig.json` → exit 0
2. `POST /signup` → 201 com `{ id, version, email, username, active,`
   `dateCreated, dateUpdated, userMetadata }`
3. `POST /signup` duplicado → 400
   `"User with this username or email already exists"`
4. `POST /signup` sem email → 400 (DTO validation)
5. `POST /signup` com metadata invalida (age < 18) → 400
6. `POST /signup` metadata failure → 500 (TX rollback: user nao persiste)
7. `PATCH /admin/users/:id` → 200 com user atualizado
8. `GET /admin/users` → 200 com lista
9. `GET /admin/users/:id` → 200 com user
10. `DELETE /admin/users/:id` → 200
11. Password fields (`password`, `passwordHash`, `passwordSalt`) NEVER in response
12. Role assignment → happens via `UserSignedUpEvent` listener (async)
