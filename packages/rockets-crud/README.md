# @bitwild/rockets-crud

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-crud)](https://www.npmjs.com/package/@bitwild/rockets-crud)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Generic CRUD module + CQRS handlers — Rockets facade over `@concepta/nestjs-crud` (the CRUD motor `defineResource()` wires).

**Status:** stable.

---

## 1. Introduction

`@bitwild/rockets-crud` is the Rockets import path for the **CRUD motor**: `@concepta/nestjs-crud@8.0.0-alpha.5`, plus one local decorator and a handful of handler base classes upstream does not surface on its public barrel yet.

It owns the CRUD primitive: `CrudModule`, `CrudAdapter`, the `Crud*` operation decorators, the `Crud*Command` / `Crud*Query` CQRS pairs and their default handlers, and `ConfigurableCrudBuilder` for hand-rolled controllers.

You usually don't import from this package directly. `@bitwild/rockets-core` consumes it via `defineResource()` and re-exports the few symbols app code needs (`Operation`, `CrudListQuery`, etc.). Reach for `@bitwild/rockets-crud` when:

- You replace a default operation handler (e.g. custom `Create` logic for one entity).
- You compose your own CRUD controller with `ConfigurableCrudBuilder` instead of letting `defineResource` generate it.
- You implement a `CrudAdapter<T>` (rare — built-ins cover TypeORM / Firestore).

### When NOT to use this package

- You want auto-generated REST CRUD with one bundle definition → use `defineResource()` from `@bitwild/rockets-core` (or transitively from `@bitwild/rockets` / `@bitwild/rockets-auth`).
- You don't need CRUD semantics at all — plain Nest controllers, no CrudModule, no overhead.

---

## 2. Get Started

### Install

```bash
yarn add @bitwild/rockets-crud @bitwild/rockets-repository @bitwild/rockets-common \
  @nestjs/common @nestjs/cqrs class-transformer class-validator reflect-metadata
```

### Use a default CRUD handler

Most apps never instantiate handlers manually — they pass them into a `defineResource` call:

```typescript
import { Operation } from '@bitwild/rockets-crud';
import {
  defineResource,
  // these are re-exported from @bitwild/rockets-crud
  CrudListQuery,
  CrudCreateCommand,
  CrudListHandler,
  CrudCreateHandler,
} from '@bitwild/rockets-core';

defineResource({
  entity: PetEntity,
  operations: [
    {
      operation: Operation.List,
      query: CrudListQuery,
      queryHandler: CrudListHandler,
    },
    {
      operation: Operation.Create,
      request: { body: PetCreateDto },
      command: CrudCreateCommand,
      commandHandler: CrudCreateHandler,
    },
  ],
});
```

The handler classes are framework-provided; nothing custom to write yet.

---

## 3. How-to Guides

### Override one operation with a custom handler

Extend the base class for the operation you replace. The base does adapter resolution, hook execution, and event publishing — your subclass only changes the part you care about.

```typescript
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import {
  CrudCreateCommand,
  CrudWithBodyCommandHandler,
} from '@bitwild/rockets-crud';

@CommandHandler(CrudCreateCommand)
export class PetCreateHandler extends CrudWithBodyCommandHandler {
  async execute(cmd: CrudCreateCommand) {
    const created = await super.execute(cmd);
    this.eventBus.publish(new PetWelcomedEvent(created.id));
    return created;
  }
}
```

Wire it via `operations[].commandHandler: PetCreateHandler` in the resource definition. `defineResource` will auto-extract it as a provider.

### Inject the per-entity CRUD adapter

`InjectCrudAdapter` (local override) accepts a class or a string key. Same algorithm as `InjectDynamicRepository`.

```typescript
import { CrudAdapter, InjectCrudAdapter } from '@bitwild/rockets-crud';

@Injectable()
export class PetReporter {
  constructor(
    @InjectCrudAdapter(PetEntity)
    private readonly pets: CrudAdapter<PetEntity>,
  ) {}
}
```

### Build a custom CRUD controller with `ConfigurableCrudBuilder`

When `defineResource` is too high-level (you want custom routes side-by-side with CRUD on the same controller), drop down to the builder.

```typescript
import {
  ConfigurableCrudBuilder,
  Operation,
} from '@bitwild/rockets-crud';

const pets = new ConfigurableCrudBuilder()
  .entity(PetEntity)
  .path('pets')
  .operation(Operation.List)
  .operation(Operation.Read)
  .operation(Operation.Create, { request: { body: PetCreateDto } })
  .build();

@Controller(pets.controller.path)
@pets.decorators.controller
export class PetController {
  // ... custom routes alongside generated CRUD operations
}
```

Read the upstream `ConfigurableCrudBuilder` source for the full options surface (deep `/dist/` import is acceptable here — the builder is a public API, only its config-shape types lag on the barrel).

### Read CRUD context inside a handler

Operation decorators attach a `CrudContextInterface` (parsed query, params, request user via overlay, etc.). `CrudCtx` is the parameter decorator.

```typescript
import {
  CrudContextInterface,
  CrudCtx,
  CrudReadQuery,
} from '@bitwild/rockets-crud';

@QueryHandler(CrudReadQuery)
export class PetReadHandler {
  execute(query: CrudReadQuery, @CrudCtx() ctx: CrudContextInterface) {
    // ctx.parsed, ctx.params, ctx.options, ctx.request
  }
}
```

In CRUD-generated controllers you do not own the method signature; use `getActor(ctx)` from `@bitwild/rockets-core` to read the authenticated user instead.

---

## 4. Reference

### Upstream engine

**Motor:** `@concepta/nestjs-crud` — `CrudModule`, CQRS commands/queries, default handlers, `ConfigurableCrudBuilder`.

**This package:** `@bitwild/rockets-crud` re-export + `InjectCrudAdapter` + handler base classes for custom `operations.*.commandHandler` overrides.

**Wiring:** `@bitwild/rockets-core` `defineResource()` / `buildAppRegistrationPlan` — you rarely import this package directly in apps.

### Local override

| Symbol | Purpose |
|---|---|
| `InjectCrudAdapter(keyOrClass)` | Class-or-string variant of upstream's decorator. Mirrors `InjectDynamicRepository`. |

### Local re-exports (not on upstream barrel today)

| Symbol | Purpose |
|---|---|
| `CrudQueryHandler` (class) | Base class for custom query handlers. Upstream's public `CrudQueryHandler` is a decorator with the same name. |
| `CrudCommandHandler` (class) | Same pattern, for command handlers. |
| `CrudWithBodyCommandHandler` (class) | Base for create / update / replace handlers (commands that carry a request body). |
| `CrudMetaview` | Service that exposes parsed CRUD metadata at runtime (filters, joins, sort). |
| `CrudRequestConfig`, `CrudResponseConfig`, `CrudParamOptionInterface`, `CrudParamsOptionsInterface` | Config shapes consumed by `defineResource` overrides. |

These are tracked TODOs against upstream; the deep `/dist/` import goes away once the symbols ship on the public barrel.

### Re-exports — `@concepta/nestjs-crud`

- **Module / adapter**: `CrudModule`, `CrudAdapter`, `CrudAdapterProvider`, `InjectCrudAdapter` (upstream variant — shadowed by the local one above).
- **Controller / decorators**: `CrudController`, every `Crud{List,Read,Create,CreateBatch,Update,Replace,Delete,SoftDelete,Restore}` operation decorator. Route decorators: `CrudAllow`, `CrudCache`, `CrudCommand`, `CrudCommandHandler` (upstream decorator), `CrudExclude`, `CrudFilter`, `CrudJoin`, `CrudLimit`, `CrudMaxLimit`, `CrudEntity`, `CrudName`, `CrudParams`, `CrudPersist`, `CrudQuery`, `CrudQueryHandler` (upstream decorator), `CrudRequestBody`, `CrudRequestBodyBatch`, `CrudResponseResource`, `CrudResponsePaginated`, `CrudReturnDeleted`, `CrudReturnRestored`, `CrudSerialize`, `CrudSort`, `CrudValidate`, `CrudResolver`. Param decorators: `CrudBody`, `CrudCtx`, `CrudContextOverlay`. OpenAPI: `CrudApiBody`, `CrudApiOperation`, `CrudApiParam`, `CrudApiQuery`, `CrudApiResponse`.
- **Builder**: `ConfigurableCrudBuilder`, `ConfigurableCrudOptions`, `ConfigurableCrudClassOptions`, `ConfigurableCrudHybridOptions`, `ConfigurableCrudGeneratedOptions`, `ConfigurableCrudClassesMap`, `ConfigurableCrudHost`, `ConfigurableCrudOptionsTransformer`, `CrudOperationOptions`, `CrudControllerClassOptionsInterface`, `CrudControllerOptionsInterface`, `CrudModuleForFeatureOptionsInterface`.
- **DTOs**: `CrudResponsePaginatedDto`, `CrudCreateBatchDto`. Interfaces: `CrudContextInterface`, `CrudParsedQueryInterface`, `CrudResponsePaginatedInterface`, `CrudResponseMetrics`, `CrudCreateBatchInterface`.
- **CQRS commands**: `CrudCreateCommand`, `CrudCreateBatchCommand`, `CrudUpdateCommand`, `CrudReplaceCommand`, `CrudDeleteCommand`, `CrudSoftDeleteCommand`, `CrudRestoreCommand`, `CrudWithBodyCommand`.
- **CQRS queries**: `CrudListQuery`, `CrudReadQuery`.
- **Default handlers**: `CrudListHandler`, `CrudReadHandler`, `CrudCreateHandler`, `CrudCreateBatchHandler`, `CrudUpdateHandler`, `CrudReplaceHandler`, `CrudDeleteHandler`, `CrudSoftDeleteHandler`, `CrudRestoreHandler`.
- **Resolvers**: `CrudAdapterResolver`, `CrudOperationResolver`, `CrudCqrsResolver`, `CrudResolverInterface`.
- **Specifications**: `CrudSpec`, `OperationSpecification`, `ActionSpecification`, `CrudSpecContextInterface`.
- **Exceptions**: `CrudException`, `CrudContextException`, `CrudDecoratorException`, `CrudQueryException`.
- **Enums**: `Operation` (re-exported from `@concepta/nestjs-common`).

---

## License

BSD-3-Clause
