# @bitwild/rockets-repository

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-repository)](https://www.npmjs.com/package/@bitwild/rockets-repository)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> The repository abstraction every Rockets package depends on. No ORM in the type layer — adapters (TypeORM, Firestore, …) plug in at the application level.

**Status:** stable.

---

## 1. Introduction

`@bitwild/rockets-repository` is the Rockets import path for the **persistence motor**: `@concepta/nestjs-repository@8.0.0-alpha.5`. Almost every symbol is a re-export; Rockets adds one local override on the injection decorator.

Concrete persistence belongs to adapter packages (`@bitwild/rockets-repository-firestore`, `@concepta/nestjs-repository-typeorm`, …). The contract here stays neutral so handlers, services, and hooks remain portable across stores.

### What it gives you

- `RepositoryInterface<T>` — the find / create / update / delete contract every adapter implements.
- `RepositoryModule.forRoot()` / `forFeature()` — the Nest module that materialises dynamic repositories.
- `InjectDynamicRepository(keyOrClass)` — the class-or-string variant of upstream's `InjectDynamicRepository` (local override).
- `Where`, `OrderBy`, `Join` — strongly-typed query builders.
- Transaction primitives: `Transactional` decorator, `TransactionScope`, `TransactionalRunner`, `TransactionInterceptor`.
- Repository hooks: `@RepoHook`, the typed lifecycle method decorators (`@BeforeCreate`, `@AfterUpdate`, …), `RepoSpec`, `EntitySpecification`.

### When to use this package

- You are writing a **handler, service, or hook** that needs to query or mutate data without committing to a specific ORM.
- You are building a Rockets adapter that must implement `RepositoryInterface` and `RepositoryModuleInterface`.

### When NOT to use this package

- You are an end-user app on top of `@bitwild/rockets` or `@bitwild/rockets-auth`. Both depend on this transitively; install the higher-level package instead.
- You only need TypeORM specifically — you still go through this contract, but you also install `@concepta/nestjs-repository-typeorm` as the adapter.

---

## 2. Get Started

### Install

```bash
yarn add @bitwild/rockets-repository @bitwild/rockets-common \
  @nestjs/common reflect-metadata
```

### Use

```typescript
import { Injectable } from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { PetEntity } from './pet.entity';

@Injectable()
export class PetService {
  constructor(
    @InjectDynamicRepository(PetEntity)
    private readonly pets: RepositoryInterface<PetEntity>,
  ) {}

  byOwner(ownerId: string) {
    return this.pets.find({
      where: Where.eq<PetEntity>('userId', ownerId),
      order: { name: 'ASC' },
      limit: 25,
    });
  }
}
```

The `PetEntity → 'pet'` key derivation is done by the local `InjectDynamicRepository`. The repository itself is materialised by whichever adapter the app's bootstrap registered (TypeORM by default in most Rockets examples).

---

## 3. How-to Guides

### Inject a dynamic repository

`InjectDynamicRepository` accepts a class (preferred) or a string key. The class form derives the key via `deriveEntityKey()` so the injection site and the entity registration agree without a `*_ENTITY_KEY` constant.

```typescript
import {
  InjectDynamicRepository,
  RepositoryInterface,
} from '@bitwild/rockets-repository';

constructor(
  // class form
  @InjectDynamicRepository(UserEntity)
  private readonly users: RepositoryInterface<UserEntity>,

  // string form (namespaced key)
  @InjectDynamicRepository('billing/invoice')
  private readonly invoices: RepositoryInterface<InvoiceEntity>,
) {}
```

### Build a type-safe `Where` clause

`Where` is generic over the entity. Mistyped column names fail at compile time.

```typescript
import { Where } from '@bitwild/rockets-repository';

const recent = Where.and<UserEntity>(
  Where.eq('active', true),
  Where.gt('createdAt', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
  Where.in('role', ['admin', 'manager']),
);

await this.users.find({ where: recent });
```

`Where.or`, `Where.not`, `Where.between`, `Where.like`, `Where.isNull`, and `Where.notNull` are also exported.

### Order and join in a query

```typescript
import { OrderBy, Join } from '@bitwild/rockets-repository';

await this.orders.find({
  order: OrderBy.fields<OrderEntity>({ createdAt: 'DESC', total: 'ASC' }),
  join: Join.leaf<OrderEntity>('customer'),
});
```

### Run code inside a transaction

The `@Transactional` decorator opens a transaction scope around a method. `TransactionScope.run()` is the imperative form for handler code.

```typescript
import { Transactional, TransactionScope } from '@bitwild/rockets-repository';

@Injectable()
export class OrderService {
  constructor(private readonly txScope: TransactionScope) {}

  @Transactional()
  async checkout(id: string) {
    await this.orders.update(id, { status: 'paid' });
    await this.inventory.decrement(id);
  }

  imperative(id: string) {
    return this.txScope.run(async () => {
      await this.orders.update(id, { status: 'paid' });
      await this.inventory.decrement(id);
    });
  }
}
```

### Attach a hook to a repository method

`@RepoHook` (or one of the typed lifecycle aliases) registers a method as a per-entity hook. Pair with `RepoSpec.isEntity('pet')` to constrain firing.

```typescript
import {
  Injectable,
  Specification,
  RepoHook,
  BeforeCreate,
  RepoSpec,
} from '@bitwild/rockets-repository';

@Injectable()
export class StampOwner {
  @Specification(RepoSpec.isEntity('pet'))
  @BeforeCreate()
  async stamp(ctx) {
    ctx.data.userId = ctx.requestUser.id;
    return ctx;
  }
}
```

> `@bitwild/rockets-core` re-exports the ergonomic factories (`OwnerStampHook.for(Entity)`, `OwnerScopeHook.for(Entity)`) on top of this primitive. Use those in app code; use the raw decorators when building your own factory.

### Resolve a dynamic repository token manually

When wiring providers by hand (rare; `defineResource` does it for you), the token format is what `getDynamicRepositoryToken` returns.

```typescript
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';

const token = getDynamicRepositoryToken('user');
// → use this in a useFactory inject array
```

---

## 4. Reference

### Upstream engine

**Motor:** `@concepta/nestjs-repository` — `RepositoryInterface`, `RepositoryModule`, dynamic repository tokens, transactions, repository hooks.

**This package:** stable `@bitwild/rockets-repository` import path + `InjectDynamicRepository(EntityClass | string)`.

**Adapters (app-level, not re-exported here):** `@concepta/nestjs-repository-typeorm`, `@bitwild/rockets-repository-firestore`, or your own `RepositoryModuleInterface` implementation.

### Local override

| Symbol | Purpose |
|---|---|
| `InjectDynamicRepository(keyOrClass)` | Class-or-string variant of upstream's decorator. String form passes through unchanged; class form derives the key with `deriveEntityKey()`. |

### Re-exports — `@concepta/nestjs-repository`

- **Module**: `RepositoryModule`, `RepositoryAdapter`, `RepositoryProviderOptions`, `RepositoryModuleInterface`, `DynamicRepositoryModule`, `RelationActionConfig`.
- **Data contract**: `RepositoryInterface<T>`, `RepositoryEntityOptionInterface`, `RepositoryColumnMetadataInterface`, `RepositoryMetadataInterface`, `RepositoryRelationMetadataInterface`.
- **Find / mutate options**: `RepositoryFindOneOptions`, `RepositoryFindOptions`, `RepositoryCreateOptions`, `RepositoryUpdateOptions`, `RepositoryUpsertOptions`, `RepositoryDeleteOptions`, `RepositoryRestoreOptions`.
- **Query helpers**: `Where`, `OrderBy`, `Join`. Types: `WhereCondition`, `WhereCompound`, `WhereClause`, `EntityColumn`, `OrderClause`, all `WhereOperator` aliases, `is*` type-guards.
- **Transactions**: `Transactional`, `TransactionalOptions`, `TransactionScope`, `TransactionalRunner`, `TransactionManager`, `TransactionInterceptor`, `TransactionFactoryInterface`, `TransactionInterface`, `TransactionContextInterface`, `TrxCtx`.
- **Context**: `RepoCtx`.
- **Hooks**: `RepoHook`, `RepoHookMethodKey`, `Specification`, `RepoSpec`, `EntitySpecification`, `RepoPermeatorFactory`. Lifecycle aliases (one per phase): `BeforeRead`, `AfterRead`, `BeforeWrite`, `AfterWrite`, `BeforeTransition`, `AfterTransition`, `BeforeDestroy`, `AfterDestroy`, plus per-method: `BeforeFind`/`AfterFind`, `BeforeFindOne`/`AfterFindOne`, `BeforeCount`/`AfterCount`, `BeforeFindAndCount`/`AfterFindAndCount`, `BeforeCreate`/`AfterCreate`, `BeforeCreateMany`/`AfterCreateMany`, `BeforeUpdate`/`AfterUpdate`, `BeforeUpsert`/`AfterUpsert`, `BeforeReplace`/`AfterReplace`, `BeforeDelete`/`AfterDelete`, `BeforeSoftDelete`/`AfterSoftDelete`, `BeforeRestore`/`AfterRestore`. Method-shape types: every `Before*Method` / `After*Method`.
- **Exceptions**: `RepositoryDuplicateKeyException`, `FederationException`, `TransactionRequiredException`, `TransactionTimeoutException`.
- **Token helper**: `getDynamicRepositoryToken(key)`.

---

## License

BSD-3-Clause
