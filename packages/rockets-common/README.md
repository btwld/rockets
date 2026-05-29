# @bitwild/rockets-common

[![NPM](https://img.shields.io/npm/v/@bitwild/rockets-common)](https://www.npmjs.com/package/@bitwild/rockets-common)
[![NestJS](https://img.shields.io/badge/NestJS-11-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> Curated facade over `@concepta/nestjs-*` plus a handful of small utilities every other Rockets package shares.

**Status:** stable.

---

## 1. Introduction

`@bitwild/rockets-common` is the shared **facade over upstream motors** (`@concepta/nestjs-hook`, `nestjs-common`, `nestjs-authentication`, `nestjs-swagger-ui`) plus six small local helpers. It is not a Nest module and does not replace those packages — it centralises imports for the rest of Rockets.

The package has **no module**. It is a pure import surface: re-exports plus six local utilities.

### What it gives you

- A re-export of `@concepta/nestjs-hook` (`HookModule`, `Spec`, `Specification`, `UseHooks`, …).
- A re-export of `@concepta/nestjs-common` (`RuntimeException`, `AuditDto`, `CommonEntityDto`, `AppContextHost`, `Operation` enum, `DomainFactory`, …).
- The relocated `AuthUser` decorator from `@concepta/nestjs-authentication`.
- A re-export of `@concepta/nestjs-swagger-ui` (`SwaggerUiModule`, `SwaggerUiService`).
- Six local utilities listed in [Reference](#4-reference).

### When to use this package

- You are building another Rockets package (or an internal app library) and want one stable import path for the shared primitives.
- You need any of the six local helpers (`deriveEntityKey`, `whitelistedFromDto`, `stripUndefined`, …).

### When NOT to use this package

- You are writing an end-user app on top of `@bitwild/rockets` or `@bitwild/rockets-auth`. Both already depend on this package transitively and re-export what they need.
- You only want one symbol — import it directly from its source `@concepta/nestjs-*` package instead.

---

## 2. Get Started

### Install

```bash
yarn add @bitwild/rockets-common \
  @nestjs/common class-transformer class-validator reflect-metadata rxjs
```

`@nestjs/common`, `class-transformer`, `class-validator`, `reflect-metadata`, and `rxjs` are peer dependencies — bring them from your app.

### Use

```typescript
import {
  AuditDto,
  RuntimeException,
  Operation,
  deriveEntityKey,
  whitelistedFromDto,
} from '@bitwild/rockets-common';

class PetEntity {}

deriveEntityKey(PetEntity); // 'pet'

throw new RuntimeException({
  message: 'Pet not found',
  httpStatus: 404,
});
```

No module to register, no providers to inject — it is just imports.

---

## 3. How-to Guides

### Derive an entity key from a class

Same algorithm the Rockets resource planner uses: strip a trailing `Entity` suffix and lowercase the first character. Use this when you want the same string everywhere (dynamic repository key, hook scope, swagger tag).

```typescript
import { deriveEntityKey } from '@bitwild/rockets-common';

deriveEntityKey(UserEntity);    // 'user'
deriveEntityKey(PetTagEntity);  // 'petTag'
deriveEntityKey(Order);         // 'order'  (no `Entity` suffix to strip)
```

For namespaced or ambiguous classes, pass an explicit string key everywhere instead.

### Resolve a key-or-class shorthand

Most Rockets APIs accept both `'pet'` and `PetEntity`. `resolveEntityKey` is the canonical implementation of that contract.

```typescript
import { resolveEntityKey } from '@bitwild/rockets-common';

resolveEntityKey('pet');         // 'pet'
resolveEntityKey(PetEntity);     // 'pet'  (via deriveEntityKey)
```

### Validate an unknown input against a DTO and drop unknown keys

`whitelistedFromDto` runs `class-transformer` + `class-validator` with `whitelist: true` and throws `BadRequestException` on validation errors. Used by handlers that receive a loose `object` and need to coerce it to a known DTO shape.

```typescript
import { whitelistedFromDto } from '@bitwild/rockets-common';
import { UpdateUserMetadataDto } from './dto/update-user-metadata.dto';

const clean = await whitelistedFromDto<UpdateUserMetadataDto>(
  UpdateUserMetadataDto,
  rawInput,
);
```

### Strip `undefined` values from a partial update

PATCH handlers typically only set the keys the client sent. Spreading them straight into a repository update would wipe untouched fields back to `undefined`. `stripUndefined` keeps only the defined keys.

```typescript
import { stripUndefined } from '@bitwild/rockets-common';

await this.repo.update(id, stripUndefined(dto));
```

### Build a minimal repository context for upstream CQRS commands

Upstream commands like `UpdateUserCommand` expect a `RepositoryContextInterface` as their first argument. `createRepositoryContext` is the minimal shape.

```typescript
import { createRepositoryContext } from '@bitwild/rockets-common';

await this.commandBus.execute(
  new UpdateUserCommand(createRepositoryContext('user'), id, dto),
);
```

### Log an error and forward its details

`logAndGetErrorDetails` standardises the error-handling pattern used across Rockets handlers: log with a custom message + context, then return `{ errorMessage, errorStack }` for re-throw.

```typescript
import { Logger } from '@nestjs/common';
import { logAndGetErrorDetails } from '@bitwild/rockets-common';

const logger = new Logger('PetService');

try {
  await this.pets.delete(id);
} catch (err) {
  const { errorMessage } = logAndGetErrorDetails(
    err,
    logger,
    'failed to delete pet',
    { petId: id },
  );
  throw new Error(errorMessage);
}
```

---

## 4. Reference

### Upstream engine

| Motor | Re-exported from this package |
|---|---|
| `@concepta/nestjs-hook` | `HookModule`, `Spec`, `UseHooks`, specifications |
| `@concepta/nestjs-common` | exceptions, audit DTOs, `AppContextHost`, `Operation` |
| `@concepta/nestjs-authentication` | `AuthUser` decorator |
| `@concepta/nestjs-swagger-ui` | `SwaggerUiModule`, `SwaggerUiService` |

Local only: `deriveEntityKey`, `whitelistedFromDto`, `stripUndefined`, `createRepositoryContext`, `getErrorDetails`, `logAndGetErrorDetails`.

### Local utilities

| Symbol | Purpose |
|---|---|
| `deriveEntityKey(cls)` | Class → camelCase key (strip `Entity`, lowercase first char). |
| `resolveEntityKey(keyOrClass)` | Accept either form, return the string key. |
| `whitelistedFromDto(dtoClass, data)` | `class-validator` whitelist → plain object; throws `BadRequestException` on errors. |
| `stripUndefined(input)` | Return a new object without keys whose value is `undefined`. |
| `createRepositoryContext(entityKey)` | Build the minimal `{ entity }` object for upstream CQRS commands. |
| `getErrorDetails(err)` / `logAndGetErrorDetails(err, logger, msg, ctx?)` | Normalise unknown errors into `{ errorMessage, errorStack }`. |

### Re-exports — `@concepta/nestjs-hook`

`HookModule`, `HookResolverService`, `Hook`, `UseHooks`, `Specification`, `createHookMethodDecorator`, `Spec`, `CompositeSpecification`, `AlwaysSpecification`, `NeverSpecification`, `AndSpecification`, `OrSpecification`, `NotSpecification`. Types: `HookTypeInterface`, `HookMethodMetadataInterface`, `HookMethodKeyType`.

### Re-exports — `@concepta/nestjs-common`

- **Settings**: `createSettingsProvider`.
- **Exceptions**: `RuntimeException`, `NotAnErrorException`, `OverlayNotDefinedException`, `ModelQueryException`, `ModelMutateException`, `ModelValidationException`, `ModelIdNoMatchException`.
- **DTOs**: `AuditDto`, `CommonEntityDto`, `ReferenceIdDto`.
- **Context**: `AppContextHost`, `getAppContext`, `Ctx`, `OverlayRef`, `ContextOverlayInterceptor`, `RefsToMethods`.
- **Events**: `EventContextHost`.
- **Enums**: `ActionEnum`, `Operation`, `ReadOperations`, `WriteOperations`, `MutateOperations`.
- **Domain**: `DomainFactory`.
- **Utilities**: `mapNonErrorToException`, `mapHttpStatus`, `toMilliseconds`.
- **Interfaces** (type-only): all `Reference*Interface`, `Audit*Interface`, `By{Email,Id,Subject,Username}Interface`, `{Create,Remove,Replace,Update}OneInterface`, plus `LiteralObject`, `DeepPartial`, `AppContextInterface`, `HookContextInterface`, `EventContextInterface`, `SpecificationInterface`, `HookOption`, `HookWithSpec`.

### Re-exports — other

- `@concepta/nestjs-authentication`: `AuthUser` decorator (relocated upstream in v8).
- `@concepta/nestjs-swagger-ui`: `SwaggerUiModule`, `SwaggerUiService`, `SwaggerUiOptionsInterface`.

---

## License

BSD-3-Clause
