# @concepta/rockets-repository-typeorm

[![NPM](https://img.shields.io/npm/v/@concepta/rockets-repository-typeorm)](https://www.npmjs.com/package/@concepta/rockets-repository-typeorm)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

TypeORM implementation of the Rockets dynamic repository contract.

**Status:** pre-1.0 preview. The package manifest is set to `1.0.0-alpha.8`, but
registry publication is pending; install commands below apply after the
`alpha` dist-tag is updated.

This is a **thin wrapper** over
[`@concepta/nestjs-repository-typeorm`](https://www.npmjs.com/package/@concepta/nestjs-repository-typeorm):
the main entry re-exports the upstream package, so consumers depend on a single
`@concepta/*` package instead of reaching for the upstream one directly. It
also owns the Rockets bootstrap that combines TypeORM connection options with
the planner-derived entity list. The zod `SchemaEntityCompiler` lives at the
`/zod` subpath.

## Install

```bash
npm install @concepta/rockets-repository-typeorm@alpha typeorm @nestjs/typeorm
```

## Repository bootstrap

Use one bootstrap at the server boundary. Rockets derives the entity list from
the resources, so the connection never repeats it:

```ts
import { createServer } from '@concepta/rockets';
import { defineTypeOrmRepository } from '@concepta/rockets-repository-typeorm';

const repository = defineTypeOrmRepository({
  type: 'postgres',
  url: process.env.DATABASE_URL,
});

createServer({ repository, resources });
```

For lower-level module registration, the upstream exports remain available:

```ts
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';

TypeOrmRepositoryModule.forFeature([UserEntity]);
```

Everything exported by `@concepta/nestjs-repository-typeorm`
(`TypeOrmRepositoryModule`, `TypeOrmRepository`, `TypeOrmTransaction`,
the base entities, …) is re-exported from the main entry.

## Zod entity compiler (`/zod` subpath)

Bridges the ORM-free zod layer (`@concepta/rockets-core/zod`) to concrete
TypeORM entity classes. Wire it once:

```ts
import { bindZodResources } from '@concepta/rockets-core/zod';
import { typeOrmZodEntityCompiler } from '@concepta/rockets-repository-typeorm/zod';

export const { zodResource, zodSubResource } =
  bindZodResources(typeOrmZodEntityCompiler);
```

`zod` and `nestjs-zod` are **optional peers** — you only pay for them if you
import the `/zod` subpath.

Requires Node.js 20.19 or newer (`require(esm)`).

## License

BSD-3-Clause
