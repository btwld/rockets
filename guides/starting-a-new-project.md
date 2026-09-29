# Guide: starting a new project

From an empty directory to a running CRUD API. Every file below is compiled
and booted by `yarn docs:check`, and the routes are exercised with real
requests.

This app has no authentication on purpose — that is the next guide, not
this one. Add it before you expose anything. The boot check still needs
to hear that: `requireAuthGuard` is on by default, so the module opts
out explicitly.

## 1. Requirements

- **Node 20.19+** (or 22.12+). The packages are CommonJS and `require()`
  the ESM `@nestjs/*` 12 line, which needs Node's `require(esm)`. Node
  20.18 fails with `ERR_REQUIRE_ESM`; Node 21 never got `require(esm)` and
  is not supported.
- A package manager. The commands below use yarn; npm and pnpm work.

## 2. Install

```bash
yarn add @concepta/rockets-core@alpha \
  @concepta/rockets-repository-typeorm@alpha typeorm @nestjs/typeorm sqlite3 \
  @nestjs/common @nestjs/core reflect-metadata rxjs zod
yarn add -D typescript @types/node
```

Pin the exact version (`0.1.0-alpha.3`) in anything you deploy: breaking
changes land between alphas and the `alpha` tag moves.

## 3. `tsconfig.json`

Two settings are not optional. `nodenext` is what makes the packages'
`exports` subpaths (`@concepta/rockets-core/zod`) resolve; the decorator
flags are what NestJS needs to see your classes.

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2022",
    "strict": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

Add the scripts you will use:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/main.js"
  }
}
```

## 4. An entity

Plain TypeORM. Rockets never asks you to extend a base class.

```typescript
// src/pet.entity.ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('pet')
export class PetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'int', nullable: true })
  age!: number | null;
}
```

## 5. The wire shapes

Named zod schemas, one per direction. The name is the OpenAPI component
name, and a route without a create/update schema has no validation pipe —
Rockets refuses to boot rather than accept an unvalidated body.

```typescript
// src/pet.schemas.ts
import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';

export const petCreateSchema = withOpenApi(
  z.object({ name: z.string().max(100), age: z.number().int().nullable() }),
  'PetCreateDto',
);

export const petUpdateSchema = withOpenApi(
  z.object({
    name: z.string().max(100).optional(),
    age: z.number().int().nullable().optional(),
  }),
  'PetUpdateDto',
);

export const petResponseSchema = withOpenApi(
  z.object({
    id: z.uuid(),
    name: z.string(),
    age: z.number().int().nullable(),
  }),
  'PetResponseDto',
);
```

## 6. The module

One resource. No controller, no service, no DTO class.

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
        // Development only. Use migrations in production, exactly as in
        // any other TypeORM app.
        // `:memory:` is rebuilt on every boot, so `synchronize` is what
        // creates the tables here. Against a database you keep, it ALTERS
        // and DROPS columns to match entities — use migrations there.
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
import { SwaggerUiService } from '@concepta/rockets-core';
import { AppModule } from './app.module';

export async function bootstrap(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  // Core registers the Swagger module; the app decides where it is served.
  // Without this call nothing answers on /api.
  app.get(SwaggerUiService).setup(app);
  await app.listen(Number(process.env.PORT || 3000));
  return app;
}

// CommonJS guard (Nest's own scaffold is CommonJS). In an ESM app
// (`"type": "module"`), call `bootstrap()` directly instead.
if (require.main === module) void bootstrap();
```

## 7. Run it

```bash
yarn build && yarn start
```

You get:

```text
GET    /pets
POST   /pets
GET    /pets/:id
PATCH  /pets/:id
DELETE /pets/:id
GET    /api          Swagger UI
GET    /api-json     the OpenAPI document
```

## 8. Then

| Next | Where |
| --- | --- |
| Authentication with your own provider | [JWKS / OIDC adapter](jwks-oidc-adapter.md) |
| Built-in signup, login, recovery, OTP | [`@concepta/rockets-auth`](https://www.npmjs.com/package/@concepta/rockets-auth) |
| Rows scoped per user or tenant | [Multi-tenant end to end](multi-tenant.md) |
| Admin sees everything, same route | [Unrestricted admin access](admin-unrestricted-access.md) |
| Database-enforced isolation | [Row-level security](row-level-security.md) |
| Every option, in reference form | [CONFIGURATION.md](https://github.com/btwld/rockets/blob/main/CONFIGURATION.md) |

## 9. Two traps when copying this repository instead of installing

- **Stale `*.tsbuildinfo`.** Copying a built tree carries incremental build
  state that points at the old paths, and `tsc` then "succeeds" without
  emitting. Delete `**/*.tsbuildinfo` and `dist/` after copying, or run
  `tsc --build --force`.
- **`workspace:^` in a packed tarball.** Inside this monorepo the packages
  reference each other with `workspace:^`, which yarn rewrites to the real
  version at pack time. If you consume a package straight from a git
  dependency instead of the registry, pin every `@concepta/rockets*` entry
  to the same commit with `resolutions`, or one of them resolves to a
  published version that does not match the rest.
