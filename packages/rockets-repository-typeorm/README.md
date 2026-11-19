# @concepta/rockets-repository-typeorm

[![NPM](https://img.shields.io/npm/v/@concepta/rockets-repository-typeorm)](https://www.npmjs.com/package/@concepta/rockets-repository-typeorm)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

TypeORM implementation of the Rockets dynamic repository contract.

**Status:** pre-1.0 preview on the `alpha` dist-tag. Pin `0.1.0-alpha.3`:
breaking changes land between alphas.

---

## 1. Introduction

Rockets keeps persistence behind `RepositoryInterface` and dynamic
repository tokens, so feature code never names an ORM. This package is the
TypeORM side of that contract, and it is deliberately thin: the main entry
re-exports [`@concepta/nestjs-repository-typeorm`](https://www.npmjs.com/package/@concepta/nestjs-repository-typeorm)
verbatim, so an application depends on one `@concepta/*` package instead of
reaching for the upstream one directly.

### What it gives you

| Piece                             | What it does                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `defineTypeOrmRepository(conn)`   | The root adapter. Owns the connection AND registers every entity the planner collected.        |
| Upstream re-exports               | `TypeOrmRepositoryModule`, `TypeOrmRepository`, `TypeOrmTransaction`, base entities, and more. |
| `typeOrmZodEntityCompiler`        | `/zod` subpath. Turns a zod schema into a real TypeORM entity class.                           |
| `assertSingleTypeOrmInstance()`   | Turns Nest's opaque "could not find DataSource element" into the actual cause.                 |

### When to use this package

- The application stores rows in SQL (SQLite, Postgres, MySQL, MSSQL, …).
- You want `resources[]` to be the only place entities are declared — no
  hand-written `TypeOrmModule.forFeature()` per feature.
- You use the zod-first layer and need generated entity classes.

### When NOT to use this package

- Documents in Firestore — install
  [`@concepta/rockets-repository-firestore`](https://www.npmjs.com/package/@concepta/rockets-repository-firestore)
  instead (both can run side by side; see the how-to below).
- Object bytes (images, PDFs, backups) — that is
  [`@concepta/rockets-storage`](https://www.npmjs.com/package/@concepta/rockets-storage),
  a different contract.

---

## 2. Get Started

### Install

```bash
yarn add @concepta/rockets-repository-typeorm@alpha \
  @concepta/rockets-core@alpha \
  @nestjs/common @nestjs/core @nestjs/typeorm typeorm \
  reflect-metadata rxjs sqlite3 zod
```

The package declares `@nestjs/common`, `@nestjs/typeorm`, `typeorm`,
`reflect-metadata` and `zod` as peers — install the database driver your
connection uses (`sqlite3` above, `pg` for Postgres, `mysql2` for MySQL).

Node 20.19 or newer is required (`require(esm)`).

### Minimal working example

Three files: an entity, the module, and the bootstrap. No controller is
written — `defineResource` generates it.

```typescript
// src/pet.entity.ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pet')
export class PetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  species!: string;
}
```

```typescript
// src/pet.schemas.ts
import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';

/**
 * Every wire shape is a NAMED zod schema — the id is the OpenAPI component
 * name. Without a create/update schema the generated route has no validation
 * pipe, and Rockets refuses to boot rather than serve an unvalidated body.
 */
export const petCreateSchema = withOpenApi(
  z.object({ name: z.string().max(100), species: z.string().max(100) }),
  'PetCreateDto',
);

export const petUpdateSchema = withOpenApi(
  z.object({
    name: z.string().max(100).optional(),
    species: z.string().max(100).optional(),
  }),
  'PetUpdateDto',
);

export const petResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), name: z.string(), species: z.string() }),
  'PetResponseDto',
);
```

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { RocketsCoreModule, defineResource } from '@concepta/rockets-core';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';
import { PetEntity } from './pet.entity';
import {
  petCreateSchema,
  petResponseSchema,
  petUpdateSchema,
} from './pet.schemas';

@Module({
  imports: [
    RocketsCoreModule.forRoot({
      routePolicy: { requireAuthGuard: false },
      repository: defineTypeOrmRepository({
        type: 'sqlite',
        database: ':memory:',
        synchronize: true,
      }),
      resources: [
        defineResource({
          entity: PetEntity,
          dto: {
            create: petCreateSchema,
            update: petUpdateSchema,
            response: petResponseSchema,
          },
        }),
      ],
    }),
  ],
})
export class AppModule {}
```

```typescript
// src/main.ts
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function bootstrap(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  await app.listen(Number(process.env.PORT || 3000));
  return app;
}

// CommonJS guard (Nest's own scaffold is CommonJS). In an ESM app
// (`"type": "module"`), call `bootstrap()` directly instead.
if (require.main === module) void bootstrap();
```

That app serves:

```text
GET    /pets
POST   /pets
GET    /pets/:id
PATCH  /pets/:id
DELETE /pets/:id
```

### What just happened

- `defineTypeOrmRepository(connection)` is the only place TypeORM is named.
  It returns a `RepositoryBootstrap`: core calls `forRoot(entities)` with
  the union of every entity the planner collected, and `forFeature(...)`
  for each dynamic repository token.
- `defineResource({ entity: PetEntity })` contributed the entity row *and*
  the CRUD controller. The connection never lists entities — duplicating
  that list is the bug this design removes.
- `synchronize: true` is a development convenience. Use migrations in
  production, exactly as in any other TypeORM application.

---

## 3. How-to Guides

### Generate entities from zod schemas

The zod layer is ORM-free: it describes schemas and delegates entity
generation to a `SchemaEntityCompiler`. This package ships the TypeORM one.
Bind it once, in a file every resource imports:

```typescript
// src/zod-bindings.ts
import { bindZodResources } from '@concepta/rockets-core/zod';
import {
  compileEntity,
  typeOrmZodEntityCompiler,
} from '@concepta/rockets-repository-typeorm/zod';

/** Compile a schema eagerly (to bind an `@EntityHook`, say). */
export const compileZodEntity = compileEntity;

export const { zodResource, zodSubResource, defineUserMetadata } =
  bindZodResources(typeOrmZodEntityCompiler);
```

Then resources are written against schemas, and the entity class comes out
of the compiler. The capability matrix for the zod layer lives in the
[core README](https://github.com/btwld/rockets/blob/main/packages/rockets-core/README.md#zod-first-resources-conceptarockets-corezod).

`zod` is a peer used only by the `/zod` subpath — importing the main entry
does not pull it in.

### Point at another driver

`defineTypeOrmRepository` takes `TypeOrmModuleOptions` unchanged, so any
driver TypeORM supports works:

```typescript
defineTypeOrmRepository({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
```

Only `entities` is owned by Rockets — it is derived from `resources[]` and
overwritten if you pass one.

### Register a repository the planner does not own

Migration code, a legacy module, or a feature that predates `resources[]`
can still use the upstream module directly:

```typescript
TypeOrmRepositoryModule.forFeature([LegacyEntity]);
```

Everything exported by `@concepta/nestjs-repository-typeorm` is re-exported
from the main entry, so the import specifier stays a single package.

### Run TypeORM and Firestore in the same app

The root `repository` is the default adapter; a bundle can override it for
one entity:

```typescript
defineResource({
  entity: AnalyticsEventEntity,
  repository: firestoreRepository,
});
```

### Transactions

`TransactionScope.run(...)` opens the scope; the adapter starts the real
transaction lazily on the first repository call that forwards `ctx`. A call
that omits `ctx` runs outside it — and with entity hooks disabled. The full
seam, including how to reach the driver's `EntityManager`, is
[CONFIGURATION §8a](https://github.com/btwld/rockets/blob/main/CONFIGURATION.md#8a-ctx-and-transactions--the-seam-you-must-not-miss-issue-60).

### Diagnose "could not find DataSource element"

`@nestjs/typeorm` uses the `DataSource` **class object** as its DI token, so
two copies of `typeorm` in one process register the provider under one token
and look it up under another. Nest reports it with no cause.

`defineTypeOrmRepository().forRoot()` calls `assertSingleTypeOrmInstance()`
first, which fails with the resolved paths and the fix instead. To fail even
earlier, call it from your own bootstrap:

```typescript
assertSingleTypeOrmInstance();
```

The fix is always deduplication — `yarn dedupe typeorm`, an npm `overrides`
entry, or a pnpm `resolutions` entry.

---

## 4. Reference

### Entry points

| Import                                      | Contents                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| `@concepta/rockets-repository-typeorm`      | `defineTypeOrmRepository`, the single-instance helpers, and every upstream export |
| `@concepta/rockets-repository-typeorm/zod`  | `typeOrmZodEntityCompiler`, `compileEntity`, `CompileEntityOptions`            |

### `defineTypeOrmRepository(connection)`

| Argument     | Type                   | Notes                                                             |
| ------------ | ---------------------- | ------------------------------------------------------------------- |
| `connection` | `TypeOrmModuleOptions` | Passed through to `TypeOrmModule.forRoot`, minus `entities`.      |

Returns a `RepositoryBootstrap` — pass it as `repository` to
`RocketsCoreModule.forRoot`, `RocketsModule.forRoot`, or `createServer`.

### Helpers

| Symbol                          | Purpose                                                                   |
| ------------------------------- | --------------------------------------------------------------------------- |
| `assertSingleTypeOrmInstance()` | Throws with the resolved paths when two copies of `typeorm` are loaded.    |
| `hasSingleTypeOrmInstance()`    | The same check as a boolean, for a health endpoint or a test.              |
| `resolvedTypeOrmRoots()`        | Package roots of every `typeorm` copy in the CommonJS cache (diagnostics). |

## Working examples

| Example                                                                                                  | Shows                                                         |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [`examples/sample-server`](https://github.com/btwld/rockets/tree/main/examples/sample-server)       | SQLite connection, zod bindings, classic and zod resources.   |
| [`examples/sample-server-auth`](https://github.com/btwld/rockets/tree/main/examples/sample-server-auth) | The same adapter under the built-in auth package.          |

---

## License

BSD-3-Clause
