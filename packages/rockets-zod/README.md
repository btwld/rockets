# @bitwild/rockets-zod

Zod-first resource layer for Rockets. A single `zod` schema is the source
of truth: it compiles to `nestjs-zod` DTO classes (create / update /
replace / response) and a `defineResource()` call. Database-agnostic —
entity generation is delegated to a `SchemaEntityCompiler` adapter
(`@bitwild/rockets-zod-typeorm`, or your own for another store).

## What it owns

- **Field metadata** (`rocketsFieldMeta`, `rocketsEntityMeta`) — `db`,
  `dto`, `relation`, and `compute` namespaces carried in a custom zod
  registry (invisible to JSON Schema output, so it never leaks into
  Swagger).
- **`zodResource` / `zodSubResource`** — schema → DTOs + `defineResource`
  / `defineSubResource`. Every other resource behavior (routing, swagger
  tags, handlers, hooks, guards) stays owned by `@bitwild/rockets-core`.
- **`bindZodResources(compiler)`** — picks the persistence compiler once
  for the whole app; returns `zodResource` / `zodSubResource` bound to it.
- **Field factories (`f.*`) + `baseEntity` / `auditableEntity`** — bake in
  the repetitive `.register(rocketsFieldMeta, …)` calls so common columns
  are expressed as data. Cover the scalar/FK 90%; anything richer
  (`.refine()`, unions, `compute`) stays raw zod.

## Field factories

```ts
import { auditableEntity, baseEntity, createdEntity, f } from '@bitwild/rockets-zod';

// createdEntity    → { id, ...shape, dateCreated }                (append-only)
// baseEntity       → { id, ...shape, dateCreated, dateUpdated }   (mutable)
// auditableEntity  → baseEntity + dateDeleted (soft delete) + version (lock)
//
// Soft delete and version are independent traits. Need only one? Compose a
// plain z.object with baseEntity's shape + f.deletedAt() / f.version() —
// the field helpers are the decoupled building blocks.
const tagSchema = baseEntity({
  name: f.string({ min: 1, max: 100, example: 'vaccinated', unique: true }),
});

const petSchema = auditableEntity({
  name: f.string({ min: 1, max: 255, example: 'Buddy' }),
  age: f.int({ min: 0, max: 50 }),
  status: f.enum(PetStatus, { default: PetStatus.ACTIVE, length: 20 }),
  notes: f.string({ text: true }).optional(),
  userId: f.owner(),                       // owner-stamped column
  ownerId: f.fk(() => userSchema, { expose: true, onDelete: 'CASCADE' }),
});
```

| Helper | Builds |
|---|---|
| `f.pk()` | uuid primary key (generated) |
| `f.createdAt()` / `f.updatedAt()` / `f.deletedAt()` | timestamp columns |
| `f.version()` | optimistic-lock counter |
| `f.owner()` | owner column (`{ owner: true }`) |
| `f.fk(target, opts?)` | indexed uuid FK + relation (`{ dto, db, ...relation }`) |
| `f.string` / `f.int` / `f.bool` / `f.enum` | scalar + `db`/`dto` meta via an option bag (`min`/`max`/`default`/`example`/`unique`/…) |

`f.fk` accepts a thunk to the related **schema** (preferred — no
entity-class import) or an entity **class**. Use the class for mutually
referencing schemas (e.g. a junction ↔ its parent): a schema target there
forms a TypeScript inference cycle that the explicitly-typed entity class
breaks.

## Usage

```ts
import { bindZodResources, rocketsFieldMeta } from '@bitwild/rockets-zod';
import { typeOrmZodEntityCompiler } from '@bitwild/rockets-zod-typeorm';
import { z } from 'zod';

export const zodEntityCompiler = typeOrmZodEntityCompiler;
export const { zodResource, zodSubResource } =
  bindZodResources(zodEntityCompiler);

const tagSchema = z.object({
  id: z.uuid().register(rocketsFieldMeta, { db: { pk: true, generated: true } }),
  name: z.string().min(1).max(100),
});

export const tagResource = zodResource({
  name: 'Tag',
  schema: tagSchema,
  table: 'tags',
  operations: ['list', 'read', 'create', 'update', 'delete'],
});
```

Per-resource override (multi-store apps): pass `entityCompiler` (or
`repository.entityCompiler`) on the definition; it wins over the bound
default.

## Dependency rule

This package never imports an ORM. The TypeORM-specific compiler lives in
`@bitwild/rockets-zod-typeorm`; the contract it implements
(`SchemaEntityCompiler`) lives in `@bitwild/rockets-core`.
