# @bitwild/rockets-repository-typeorm

TypeORM implementation of the Rockets dynamic repository contract.

This is a **thin wrapper** over
[`@concepta/nestjs-repository-typeorm`](https://www.npmjs.com/package/@concepta/nestjs-repository-typeorm):
the main entry re-exports the upstream package verbatim, so consumers depend
on a single `@bitwild/*` package instead of reaching for the upstream one
directly. The Rockets-specific addition — the zod `SchemaEntityCompiler` —
lives at the `/zod` subpath and is the only code this package owns.

## Install

```bash
npm install @bitwild/rockets-repository-typeorm typeorm
```

## Repository module

```ts
import { TypeOrmRepositoryModule } from '@bitwild/rockets-repository-typeorm';

TypeOrmRepositoryModule.forFeature([UserEntity]);
```

Everything exported by `@concepta/nestjs-repository-typeorm`
(`TypeOrmRepositoryModule`, `TypeOrmRepository`, `TypeOrmTransaction`,
the base entities, …) is re-exported from the main entry.

## Zod entity compiler (`/zod` subpath)

Bridges the ORM-free zod layer (`@bitwild/rockets-core/zod`) to concrete
TypeORM entity classes. Wire it once:

```ts
import { bindZodResources } from '@bitwild/rockets-core/zod';
import { typeOrmZodEntityCompiler } from '@bitwild/rockets-repository-typeorm/zod';

export const { zodResource, zodSubResource } =
  bindZodResources(typeOrmZodEntityCompiler);
```

`zod` and `nestjs-zod` are **optional peers** — you only pay for them if you
import the `/zod` subpath.

## License

BSD-3-Clause
