# @bitwild/rockets-zod-typeorm

TypeORM implementation of the `SchemaEntityCompiler` contract used by
[`@bitwild/rockets-zod`](../rockets-zod). It compiles a zod object schema
into a decorated TypeORM entity class at module-load time — to TypeORM
and the dynamic repository layer the result is indistinguishable from a
handwritten entity.

## Why a separate package

The compiler is both zod-specific and TypeORM-specific. Keeping it out of
`@bitwild/rockets-zod` keeps that layer ORM-free; keeping it out of
`@bitwild/rockets-repository-typeorm` keeps the generic TypeORM adapter
zod-free. Non-zod TypeORM apps don't pull zod; Firestore zod apps don't
pull TypeORM. Mirror this package for any other store.

## Usage

```ts
import { bindZodResources } from '@bitwild/rockets-zod';
import { typeOrmZodEntityCompiler } from '@bitwild/rockets-zod-typeorm';

export const zodEntityCompiler = typeOrmZodEntityCompiler;
export const { zodResource, zodSubResource } =
  bindZodResources(zodEntityCompiler);
```

## Column mapping

| `db` meta              | TypeORM decorator                         |
| ---------------------- | ----------------------------------------- |
| `pk: true`             | `@PrimaryGeneratedColumn('uuid')`         |
| `createdAt: true`      | `@CreateDateColumn()`                     |
| `updatedAt: true`      | `@UpdateDateColumn()`                     |
| `deletedAt: true`      | `@DeleteDateColumn()` (soft delete)       |
| `unique: true`         | `@Column({ unique: true })`               |
| `index: true`          | `@Index()`                                |
| `column: { ... }`      | raw `ColumnOptions`, merged last          |
| `relation: { ... }`    | FK column + `@ManyToOne`/`@OneToOne`/`@OneToMany` + `@JoinColumn` |

Everything else derives from the zod type (string `max` → `varchar`
length, `.optional()`/`.nullable()` → nullable, `.default()` → column
default).
