# Rockets DDD / Clean Architecture Reference

Use this command when porting a Rockets module to DDD/Clean Architecture.
The `nestjs-cache` module is the reference implementation.

## Layer Structure

```text
src/
├── domain/           # Business logic, zero framework deps
│   ├── aggregates/   # Root aggregates (extend DomainAggregate<T>)
│   ├── events/       # Domain events (implement IEvent)
│   ├── exceptions/   # Business rule violations
│   ├── policies/     # Domain policies
│   ├── repositories/ # Repository + resolver interfaces
│   ├── services/     # Domain services
│   └── utils/        # Pure functions, no side effects
├── application/      # Use cases, orchestration
│   ├── commands/
│   │   ├── impl/     # Command data carriers
│   │   └── handlers/ # @CommandHandler implementations
│   ├── queries/
│   │   ├── impl/     # Query data carriers
│   │   └── handlers/ # @QueryHandler implementations
│   ├── exceptions/   # Application-level errors (NotFoundException, etc.)
│   ├── listeners/    # Event listeners (optional)
│   └── utils/        # Assertion functions
├── infrastructure/   # Technical concerns
│   ├── config/       # registerAs() configs
│   │   └── interfaces/
│   ├── dtos/         # class-validator DTOs
│   ├── exceptions/   # Infrastructure errors
│   ├── persistence/  # Repository, mapper, entity interface
│   │   └── interfaces/  # Entity interfaces
│   └── utils/        # Provider factories (repository, settings)
├── gateways/         # Entry points (HTTP, if applicable)
│   └── http/
│       ├── commands/
│       │   ├── impl/     # CrudXxxRequest classes
│       │   └── handlers/ # Maps CRUD → domain commands
│       └── queries/
│           ├── impl/
│           └── handlers/
├── interfaces/       # Public module interfaces
├── utils/            # Shared utilities
└── __tests__/
    ├── fixtures/
    │   ├── entities/
    │   └── factories/
    └── helpers/
        └── mock.helpers.ts
```

## Domain Aggregate

Aggregates extend `DomainAggregate<T>` from `@concepta/nestjs-common/aggregate`.
The base class provides `id`, `version`, `meta` (audit timestamps), `props`,
`stampCreated()`, `stampUpdated()`, `stampDeleted()`, `incrementVersion()`,
and `toPlain()` which returns `{ id, version, ...props, ...meta }`.

```typescript
import { randomUUID } from 'crypto';

import {
  MyCreatableInterface,
  MyInterface,
  DomainFactory,
  EntityHeaderInterface,
  EventContextHost,
} from '@concepta/nestjs-common';
import {
  AggregateMetaInterface,
  DomainAggregate,
} from '@concepta/nestjs-common/aggregate';

import { MyCreatedEvent } from '../events/my-created.event';
import { MyUpdatedEvent } from '../events/my-updated.event';
import { MyReplacedEvent } from '../events/my-replaced.event';

export class MyAggregate extends DomainAggregate<MyInterface> {
  constructor(
    id: string,
    props: MyInterface,
    version?: number,
    meta?: AggregateMetaInterface,
  ) {
    super(id, props, version, meta);
  }

  // Read-only getters for domain properties
  get name() { return this.props.name; }
  get description() { return this.props.description; }

  // Static factories — always take eventContext as first arg
  static create(
    eventContext: EventContextHost<EntityHeaderInterface>,
    dto: MyCreatableInterface,
  ): MyAggregate {
    return MyAggregate.createWithId(eventContext, randomUUID(), dto);
  }

  static createWithId(
    eventContext: EventContextHost<EntityHeaderInterface>,
    id: string,
    dto: MyCreatableInterface,
  ): MyAggregate {
    const { name, description } = dto;
    const agg = new MyAggregate(id, { name, description });
    agg.apply(new MyCreatedEvent(eventContext, agg.toPlain()));
    return agg;
  }

  // Partial update — spread merge, bump version, emit event
  update(
    eventContext: EventContextHost<EntityHeaderInterface>,
    dto: Partial<MyCreatableInterface>,
  ): void {
    this.props = { ...this.props, ...dto };
    this.incrementVersion();
    this.apply(new MyUpdatedEvent(eventContext, this.toPlain()));
  }

  // Full replacement — explicit fields, no spread merge
  replace(
    eventContext: EventContextHost<EntityHeaderInterface>,
    dto: MyCreatableInterface,
  ): void {
    const { name, description } = dto;
    this.props = { name, description };
    this.incrementVersion();
    this.apply(new MyReplacedEvent(eventContext, this.toPlain()));
  }
}

// Type constraint — enforces create/createWithId factory signatures
MyAggregate satisfies DomainFactory<MyCreatableInterface, MyAggregate>;
```

**Key rules:**

- Never mutate `this.props` fields directly; always reassign via spread
- `stampUpdated()` / `stampDeleted()` are called by the **repository**, not the aggregate
- `incrementVersion()` is called by the aggregate on state mutations
- `toPlain()` is inherited — returns `{ id, version, ...props, ...meta }`
- `DomainFactory<CreateProps, Agg> satisfies` goes after the class declaration

## Domain Mapper

`DomainMapper<Entity, Props, Aggregate>` bridges persistence entities and domain
aggregates. Concrete mappers implement `createAggregate()` and are registered as
NestJS providers, injected into repositories.

```typescript
import { MyInterface } from '@concepta/nestjs-common';
import { DomainMapper } from '@concepta/nestjs-common/aggregate';

import { MyAggregate } from '../../domain/aggregates/my-aggregate';
import { MyEntityInterface } from './interfaces/my-entity.interface';

export class MyMapper extends DomainMapper<
  MyEntityInterface,
  MyInterface,
  MyAggregate
> {
  createAggregate(entity: MyEntityInterface): MyAggregate {
    const { id, version, dateCreated, dateUpdated, dateDeleted, ...props } =
      entity;

    return new MyAggregate(id, props, version, {
      dateCreated,
      dateUpdated,
      dateDeleted,
    });
  }
}
```

**Inherited methods (do not override):**

- `toDomain(entity)` — calls `createAggregate(entity)`
- `toPersistence(aggregate)` — calls `aggregate.toPlain()`

## Entity Interface

Entity interfaces compose reference, domain, and audit interfaces:

```typescript
import {
  AuditInterface,
  MyInterface,
  ReferenceIdInterface,
  ReferenceVersionInterface,
} from '@concepta/nestjs-common';

export interface MyEntityInterface
  extends ReferenceIdInterface,
    ReferenceVersionInterface,
    MyInterface,
    AuditInterface {}
```

This gives the entity: `id`, `version`, domain props, `dateCreated`,
`dateUpdated`, `dateDeleted`.

## Domain Events

Events carry an `EventContextHost` and an interface snapshot:

```typescript
import { IEvent } from '@nestjs/cqrs';

import {
  MyInterface,
  EntityHeaderInterface,
  EventContextHost,
} from '@concepta/nestjs-common';

export class MyCreatedEvent implements IEvent {
  constructor(
    public readonly eventContext: EventContextHost<EntityHeaderInterface>,
    public readonly entity: MyInterface,
  ) {}
}
```

All events in a module follow this same two-arg constructor pattern.

## Domain Exceptions

```typescript
// Base exception per module
export class MyException extends RuntimeException {
  constructor(options?: RuntimeExceptionOptions) {
    super(options);
    this.errorCode = 'MY_ERROR';
  }
}

// Specific exceptions
export class MyNotFoundException extends MyException {
  context: RuntimeException['context'] & { id: string };
  constructor(id: string) {
    super({
      httpStatus: HttpStatus.NOT_FOUND,
      message: 'Entity not found for id=%s',
      messageParams: [id],
    });
    this.errorCode = 'MY_NOT_FOUND_ERROR';
    this.context = { ...super.context, id };
  }
}
```

## Command Pattern

```typescript
// impl/create-my.command.ts
import { MyCreatableInterface } from '@concepta/nestjs-common';
import { RepositoryContextInterface } from '@concepta/nestjs-repository';

export class CreateMyCommand {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly dto: MyCreatableInterface,
  ) {}
}

// handlers/create-my.handler.ts
@CommandHandler(CreateMyCommand)
export class CreateMyHandler implements ICommandHandler<CreateMyCommand> {
  constructor(
    @Inject(MY_REPOSITORY_RESOLVER_TOKEN)
    private readonly repositoryResolver: MyRepositoryResolverInterface,
    private readonly txScope: TransactionScope,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(command: CreateMyCommand): Promise<MyAggregate> {
    const { ctx, dto } = command;

    const repo = this.repositoryResolver.resolve(ctx.entity);

    // Build event context from repository context
    const eventContext = EventContextHost.builder<EntityHeaderInterface>()
      .setHeader('entity', ctx.entity)
      .build();

    return this.txScope.run(ctx, async (trx) => {
      const agg = this.eventPublisher.mergeObjectContext(
        MyAggregate.create(eventContext, dto),
      );

      await repo.save(ctx, agg);

      trx.onCommit(ctx, () => agg.commit());
      trx.onRollback(ctx, () => agg.uncommit());

      return agg;
    });
  }
}
```

**Upsert/Replace handler variant** — check existence, then create-or-replace:

```typescript
async execute(command: ReplaceMyCommand): Promise<MyAggregate> {
  const { ctx, id, dto } = command;
  const repo = this.repositoryResolver.resolve(ctx.entity);
  const eventContext = EventContextHost.builder<EntityHeaderInterface>()
    .setHeader('entity', ctx.entity)
    .build();

  return this.txScope.run(ctx, async (trx) => {
    let agg: MyAggregate;
    const existing = await repo.get(ctx, id);

    if (existing) {
      agg = this.eventPublisher.mergeObjectContext(existing);
      agg.replace(eventContext, dto);
    } else {
      agg = this.eventPublisher.mergeObjectContext(
        MyAggregate.createWithId(eventContext, String(id), dto),
      );
    }

    await repo.save(ctx, agg);
    trx.onCommit(ctx, () => agg.commit());
    trx.onRollback(ctx, () => agg.uncommit());
    return agg;
  });
}
```

## Query Pattern

```typescript
// impl/get-my.query.ts
import { ReferenceId } from '@concepta/nestjs-common';
import { RepositoryContextInterface } from '@concepta/nestjs-repository';

export class GetMyQuery {
  constructor(
    public readonly ctx: RepositoryContextInterface,
    public readonly id: ReferenceId,
  ) {}
}

// handlers/get-my.handler.ts
@QueryHandler(GetMyQuery)
export class GetMyHandler implements IQueryHandler<GetMyQuery> {
  constructor(
    @Inject(MY_REPOSITORY_RESOLVER_TOKEN)
    private readonly repositoryResolver: MyRepositoryResolverInterface,
  ) {}

  async execute(query: GetMyQuery): Promise<MyAggregate> {
    const { ctx, id } = query;
    const repo = this.repositoryResolver.resolve(ctx.entity);
    const result = await repo.get(ctx, id);

    if (!result) {
      throw new MyNotFoundException(id);
    }

    return result;
  }
}
```

**Convention:** Repositories return `null` on not-found. Query/command
**handlers** throw the NotFoundException when needed.

## Repository Pattern

```typescript
import { ReferenceId } from '@concepta/nestjs-common';
import {
  RepositoryContextInterface,
  RepositoryInterface,
  Where,
} from '@concepta/nestjs-repository';

import { MyAggregate } from '../../domain/aggregates/my-aggregate';
import { MyRepositoryInterface } from '../../domain/repositories/my-repository.interface';
import { MyMapper } from './my.mapper';
import { MyEntityInterface } from './interfaces/my-entity.interface';

export class MyRepository implements MyRepositoryInterface {
  constructor(
    protected readonly repository: RepositoryInterface<MyEntityInterface>,
    private readonly mapper: MyMapper,
  ) {}

  async get(
    ctx: RepositoryContextInterface,
    id: ReferenceId,
  ): Promise<MyAggregate | null> {
    const w = Where.for<MyEntityInterface>();
    const entity = await this.repository.findOne({
      where: w.eq('id', id),
      ctx,
    });
    return entity ? this.mapper.toDomain(entity) : null;
  }

  async save(
    ctx: RepositoryContextInterface,
    agg: MyAggregate,
  ): Promise<void> {
    agg.stampUpdated();
    await this.repository.upsert(this.mapper.toPersistence(agg), { ctx });
  }

  async remove(
    ctx: RepositoryContextInterface,
    agg: MyAggregate,
  ): Promise<void> {
    await this.repository.delete(this.mapper.toPersistence(agg), { ctx });
  }

  async softRemove(
    ctx: RepositoryContextInterface,
    agg: MyAggregate,
  ): Promise<void> {
    agg.stampDeleted();
    await this.repository.softDelete(this.mapper.toPersistence(agg), { ctx });
  }
}
```

**Key rules:**

- Constructor takes `(repository, mapper)` — never settings
- `get()` returns `null`, not an exception
- `save()` calls `agg.stampUpdated()` before persisting
- `softRemove()` calls `agg.stampDeleted()` before soft-deleting
- Use `Where.for<Entity>()` builder for all queries
- Batch delete: pass `items.map((a) => this.mapper.toPersistence(a))` to
  `this.repository.deleteMany(..., { ctx })`

## Dynamic Provider Factory

```typescript
import { Provider, Type } from '@nestjs/common';
import {
  getDynamicRepositoryToken,
  RepositoryInterface,
} from '@concepta/nestjs-repository';

import { MY_CUSTOM_REPOSITORY_TOKEN } from '../../my.constants';
import { MyRepositoryInterface } from '../../domain/repositories/my-repository.interface';
import { MyMapper } from '../persistence/my.mapper';
import { MyRepository } from '../persistence/my.repository';
import { MyEntityInterface } from '../persistence/interfaces/my-entity.interface';

export function getDynamicMyRepositoryToken(entityKey: string): string {
  return `MY_REPOSITORY_${entityKey.toUpperCase()}`;
}

export function createMyRepositoryProvider(entityKey: string): Provider {
  return {
    provide: getDynamicMyRepositoryToken(entityKey),
    inject: [
      getDynamicRepositoryToken(entityKey),
      MyMapper,
      { token: MY_CUSTOM_REPOSITORY_TOKEN, optional: true },
    ],
    useFactory: (
      repository: RepositoryInterface<MyEntityInterface>,
      mapper: MyMapper,
      customRepo?: Type<MyRepositoryInterface>,
    ) => {
      const RepoClass = customRepo ?? MyRepository;
      return new RepoClass(repository, mapper);
    },
  };
}
```

## Repository Resolver

```typescript
@Injectable()
export class MyRepositoryResolver {
  constructor(private readonly moduleRef: ModuleRef) {}

  resolve(entityKey: string): MyRepositoryInterface {
    const token = getDynamicMyRepositoryToken(entityKey);
    try {
      return this.moduleRef.get<MyRepositoryInterface>(token, { strict: false });
    } catch {
      throw new MyEntityNotFoundException(entityKey);
    }
  }
}
```

## Module Definition

```typescript
@Module({})
export class MyModule {
  static register(options: MyOptions): DynamicModule {
    return {
      module: MyModule,
      imports: [MyCoreModuleClass.register({ ...options, global: false })],
    };
  }

  static registerAsync(options: MyAsyncOptions): DynamicModule {
    return {
      module: MyModule,
      imports: [MyCoreModuleClass.registerAsync({ ...options, global: false })],
    };
  }

  static forRoot(options: MyOptions): DynamicModule {
    return {
      module: MyModule,
      imports: [MyCoreModuleClass.register({ ...options, global: true })],
    };
  }

  static forRootAsync(options: MyAsyncOptions): DynamicModule {
    return {
      module: MyModule,
      imports: [MyCoreModuleClass.registerAsync({ ...options, global: true })],
    };
  }

  static forFeature(entityKeys: string[]): DynamicModule {
    const providers = entityKeys.map((entityKey) =>
      createMyRepositoryProvider(entityKey),
    );
    return {
      module: MyModule,
      providers,
      exports: providers,
    };
  }
}
```

## Gateway (HTTP) — Only for modules with CRUD controllers

### Create

```typescript
@Injectable()
export class CreateMyRequestHandler {
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: CreateMyRequest) {
    const { context, dto } = command;
    const agg = await this.commandBus.execute<CreateMyCommand, MyAggregate>(
      new CreateMyCommand(context, dto),
    );
    return agg.toPlain();
  }
}
```

### Update

```typescript
@Injectable()
export class UpdateMyRequestHandler {
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: UpdateMyRequest) {
    const { context, dto } = command;
    const { id } = context.params;

    assertMyId(id);

    const agg = await this.commandBus.execute<UpdateMyCommand, MyAggregate>(
      new UpdateMyCommand(context, id, dto),
    );
    return agg.toPlain();
  }
}
```

### Delete (conditional soft/hard)

```typescript
@Injectable()
export class DeleteMyRequestHandler {
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: DeleteMyRequest) {
    const { context } = command;
    const { id } = context.params;
    const { returnDeleted = false } = context.options?.route ?? {};

    assertMyId(id);

    let agg: MyAggregate;

    if (context.operation === Operation.SoftDelete) {
      agg = await this.commandBus.execute(new ArchiveMyCommand(context, id));
    } else {
      agg = await this.commandBus.execute(new RemoveMyCommand(context, id));
    }

    return returnDeleted ? agg.toPlain() : null;
  }
}
```

## DTO Pattern

```typescript
import { Exclude, Expose, Type } from 'class-transformer';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { MyInterface } from '@concepta/nestjs-common';
import { DomainAggregateDto } from '@concepta/nestjs-common/aggregate';

@Exclude()
export class MyDto extends DomainAggregateDto implements MyInterface {
  @Expose()
  @ApiProperty({ type: 'string' })
  @IsString()
  name = '';

  @Expose()
  @ApiProperty({ type: 'string' })
  @IsString()
  @IsOptional()
  description = '';
}
```

`DomainAggregateDto` provides `id`, `version`, `dateCreated`, `dateUpdated`, `dateDeleted`.

### Paginated DTO

```typescript
import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { CrudResponsePaginatedDto } from '@concepta/nestjs-crud';

import { MyDto } from './my.dto';

@Exclude()
export class MyPaginatedDto extends CrudResponsePaginatedDto<MyDto> {
  @Expose()
  @ApiProperty({ type: MyDto, isArray: true })
  @Type(() => MyDto)
  data: MyDto[] = [];
}
```

## Test Mock Helpers

```typescript
import {
  createMockCommandBus,
  createMockEventPublisher,
  createMockEventContext as createMockEventContextBase,
} from '@concepta/nestjs-common/testing';
import {
  createMockContext as createMockContextBase,
  createMockTransaction,
} from '@concepta/nestjs-repository/testing';

import { MyAggregate } from '../../domain/aggregates/my-aggregate';
import { MyRepositoryResolver } from '../../infrastructure/persistence/my-repository.resolver';
import { MyMapper } from '../../infrastructure/persistence/my.mapper';
import { MyRepository } from '../../infrastructure/persistence/my.repository';
import { MyEntityInterface } from '../../infrastructure/persistence/interfaces/my-entity.interface';

export {
  createMockCommandBus,
  createMockEventPublisher,
  createMockTransaction,
};
export type { MockTransactionHandle } from '@concepta/nestjs-repository/testing';

export function createMockMyRepository(): jest.Mocked<MyRepository> {
  return {
    get: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    softRemove: jest.fn(),
  } as unknown as jest.Mocked<MyRepository>;
}

export function createMockRepositoryResolver(
  repo: MyRepository,
): jest.Mocked<MyRepositoryResolver> {
  return {
    resolve: jest.fn().mockReturnValue(repo),
  } as unknown as jest.Mocked<MyRepositoryResolver>;
}

export function createMockContext(entity = 'MyEntity') {
  return createMockContextBase(entity);
}

export function createMockEventContext(entity = 'MyEntity') {
  return createMockEventContextBase(entity);
}

// Entity factory with sensible defaults and override support
export function createMockMyEntity(
  overrides: Partial<MyEntityInterface> = {},
): MyEntityInterface {
  return {
    id: 'test-id',
    name: 'Test Name',
    description: 'Test description',
    dateCreated: new Date('2026-01-01'),
    dateUpdated: new Date('2026-01-01'),
    dateDeleted: null,
    version: 1,
    ...overrides,
  };
}

// Domain conversion via real mapper
const myMapper = new MyMapper();

export function toMyDomain(entity: MyEntityInterface): MyAggregate {
  return myMapper.toDomain(entity);
}
```

## Key Conventions

- **Aggregates**: Extend `DomainAggregate<T>`, use `satisfies DomainFactory<...>`
  after class
- **Immutability**: `this.props = { ...this.props, ... }` — never direct field
  mutation
- **Factories**: `create(eventContext, dto)` / `createWithId(eventContext, id, dto)`
  — always take `EventContextHost` first
- **Version**: Call `this.incrementVersion()` in aggregate mutations; never manual
  `version + 1`
- **Timestamps**: Repo calls `stampUpdated()` / `stampDeleted()` — not the aggregate
  methods
- **Mapper**: `DomainMapper<Entity, Props, Agg>` with `createAggregate()` —
  destructure meta from entity
- **Repository**: `(repository, mapper)` injection, `null` returns on not-found,
  positional `(ctx, ...)` args
- **Events**: `(eventContext, payload)` two-arg constructor, committed via
  `trx.onCommit(() => agg.commit())`
- **EventContext**: Build with `EventContextHost.builder<EntityHeaderInterface>()`,
  chaining `.setHeader('entity', ctx.entity).build()`
- **Commands/Queries**: Data carriers only, no logic
- **Handlers**: Stateless, resolve repo via resolver, wrap mutations in
  `txScope.run()`, handlers throw NotFound
- **DTOs**: `@Exclude()` class-level + `@Expose()` per field, extend
  `DomainAggregateDto`
- **Naming**: `CreateMyCommand`, `MyCreatedEvent`, `CreateMyHandler`, `MyRepository`,
  `MyMapper`, `MyRepositoryResolver`
- **Exports**: Barrel `index.ts` + `optional-crud.ts` + `optional-seeding.ts`
- **Tests**: `__tests__/` directories parallel to source, `mock.helpers.ts` with
  entity factory and `toDomain()` via real mapper
- **Mocks**: Import `createMockCommandBus`, `createMockEventPublisher` from
  `@concepta/nestjs-common/testing`; `createMockContext`, `createMockTransaction`
  from `@concepta/nestjs-repository/testing`
