import { z } from 'zod';
import {
  rocketsFieldMeta,
  type RocketsDbFieldMeta,
  type RocketsDtoFieldMeta,
  type RocketsFieldMeta,
  type RocketsRelationFieldMeta,
} from './field-meta';

/**
 * Reusable field factories for zod-first resources. Each one bakes in the
 * `.register(rocketsFieldMeta, …)` call (in the order field-meta.ts
 * requires) so authored schemas express the COMMON cases as data, not as
 * repeated metadata incantations. Anything richer — `.refine()`, unions,
 * nested objects — stays raw zod; these helpers cover the 90% scalar/FK
 * surface, not all of zod.
 *
 * Every helper is a FACTORY (fresh instance per call): zod schemas are
 * immutable and the registry entry lives on the instance, so sharing one
 * node across two schemas would be a latent bug.
 */

/** Meta knobs shared by every scalar builder (mirrors the three namespaces). */
interface FieldOpts {
  /** Native `.meta({ example })` — lands in the OpenAPI document. */
  readonly example?: string;
  /** Native `.meta({ description })` — lands in the OpenAPI document. */
  readonly description?: string;
  /** `db.unique` — UNIQUE column constraint. */
  readonly unique?: boolean;
  /** `db.index` — index this column. */
  readonly index?: boolean;
  /** Per-projection DTO roles (`create` / `update` / `response`). */
  readonly dto?: RocketsDtoFieldMeta;
  /** Raw column-options escape hatch (`{ type: 'text' }`, …). */
  readonly column?: RocketsDbFieldMeta['column'];
}

/**
 * Register field meta on a CONCRETE schema. Routed through this helper on
 * purpose: `schema.register(rocketsFieldMeta, …)` leaves zod's recursive
 * `$replace<Meta, S>` meta-arg type unresolved over a bare generic `T`
 * (the same friction that forces `RelationTarget = () => unknown`). With a
 * concrete `z.ZodType` parameter the conditional resolves to
 * `RocketsFieldMeta`, so callers keep their precise schema type.
 */
function registerFieldMeta(schema: z.ZodType, meta: RocketsFieldMeta): void {
  rocketsFieldMeta.add(schema, meta);
}

/**
 * Apply `.meta()` (when there is API-facing text) and the field-meta
 * registration (when there is db/dto metadata) to a built schema,
 * preserving its precise type. No-ops when there is nothing to attach, so
 * a plain `f.string()` stays a bare `z.string()`.
 */
function decorate<T extends z.ZodType>(schema: T, o: FieldOpts): T {
  let result = schema;

  if (o.example !== undefined || o.description !== undefined) {
    result = result.meta({
      ...(o.example !== undefined ? { example: o.example } : {}),
      ...(o.description !== undefined ? { description: o.description } : {}),
    });
  }

  const db: RocketsDbFieldMeta = {
    ...(o.unique ? { unique: true } : {}),
    ...(o.index ? { index: true } : {}),
    ...(o.column ? { column: o.column } : {}),
  };
  const meta: RocketsFieldMeta = {
    ...(Object.keys(db).length > 0 ? { db } : {}),
    ...(o.dto ? { dto: o.dto } : {}),
  };
  if (Object.keys(meta).length > 0) {
    registerFieldMeta(result, meta);
  }
  return result;
}

// --- Identity / audit columns -------------------------------------------

/** uuid primary key, db-generated. */
const pk = () =>
  z.uuid().register(rocketsFieldMeta, { db: { pk: true, generated: true } });

/** `@CreateDateColumn` — ISO datetime on the wire. */
const createdAt = () =>
  z.iso.datetime().register(rocketsFieldMeta, { db: { createdAt: true } });

/** `@UpdateDateColumn`. */
const updatedAt = () =>
  z.iso.datetime().register(rocketsFieldMeta, { db: { updatedAt: true } });

/** `@DeleteDateColumn` — nullable + optional so soft-deleted rows validate. */
const deletedAt = () =>
  z.iso
    .datetime()
    .register(rocketsFieldMeta, { db: { deletedAt: true } })
    .nullable()
    .optional();

/** Optimistic-lock counter — excluded from create/update DTOs. */
const version = () =>
  z
    .int()
    .default(1)
    .register(rocketsFieldMeta, { dto: { create: false, update: false } });

/**
 * Owner column (uuid). Marks the field `{ owner: true }` so the zod
 * resource layer auto-wires an `OwnerStampHook` for it. Combine with the
 * resource-level `owner: 'fieldName'` if the resource also scopes reads by
 * owner — the two declarations dedupe.
 */
const owner = () => z.uuid().register(rocketsFieldMeta, { owner: true });

// --- Foreign key --------------------------------------------------------

/** `f.fk` options: relation meta (minus `target`) plus optional db/dto roles. */
interface FkOpts extends Omit<RocketsRelationFieldMeta, 'target'> {
  readonly dto?: RocketsDtoFieldMeta;
  readonly db?: RocketsDbFieldMeta;
}

/**
 * Indexed uuid foreign key carrying a relation. `target` is a thunk to the
 * related zod schema (preferred) or entity class; the rest of the relation
 * meta (`expose`, `onDelete`, `include`, `kind`, …) passes straight
 * through. `db.index` is on by default; override via `db`.
 */
const fk = (target: RocketsRelationFieldMeta['target'], o: FkOpts = {}) => {
  const { dto, db, ...relation } = o;
  const meta: RocketsFieldMeta = {
    db: { index: true, ...db },
    ...(dto ? { dto } : {}),
    relation: { target, ...relation },
  };
  return z.uuid().register(rocketsFieldMeta, meta);
};

// --- Scalar builders ----------------------------------------------------

interface StringOpts extends FieldOpts {
  readonly min?: number;
  readonly max?: number;
  /** Map to a `text` column instead of `varchar`. */
  readonly text?: boolean;
  /** Column default applied when the field is omitted. */
  readonly default?: string;
}

const string = (o: StringOpts = {}) => {
  let base = z.string();
  if (o.min !== undefined) base = base.min(o.min);
  if (o.max !== undefined) base = base.max(o.max);
  const built = o.default !== undefined ? base.default(o.default) : base;
  return decorate(built, o.text ? { ...o, column: { type: 'text' } } : o);
};

interface IntOpts extends FieldOpts {
  readonly min?: number;
  readonly max?: number;
  /** Column default applied when the field is omitted. */
  readonly default?: number;
}

const int = (o: IntOpts = {}) => {
  let base = z.int();
  if (o.min !== undefined) base = base.min(o.min);
  if (o.max !== undefined) base = base.max(o.max);
  const built = o.default !== undefined ? base.default(o.default) : base;
  return decorate(built, o);
};

interface BoolOpts extends FieldOpts {
  readonly default?: boolean;
}

const bool = (o: BoolOpts = {}) =>
  decorate(
    o.default !== undefined ? z.boolean().default(o.default) : z.boolean(),
    o,
  );

interface EnumOpts<D extends string> extends FieldOpts {
  readonly default?: D;
  /** `db.column.length` for the generated varchar. */
  readonly length?: number;
}

const enumField = <const T extends Record<string, string>>(
  values: T,
  o: EnumOpts<T[keyof T]> = {},
) => {
  const base =
    o.default !== undefined
      ? z.enum(values).default(o.default)
      : z.enum(values);
  return decorate(
    base,
    o.length !== undefined ? { ...o, column: { length: o.length } } : o,
  );
};

/**
 * Response-only COMPUTED field. `fn` receives the raw row (after eager
 * relations load) and returns the projected value; the passed `schema`
 * documents its shape in OpenAPI. The `row` parameter is typed here, so
 * the callback needs no annotation — unlike a raw
 * `.register(rocketsFieldMeta, { compute })` inside a generic composer,
 * where contextual typing breaks and forces a manual `row` type.
 */
const compute = <T extends z.ZodType>(
  schema: T,
  fn: (row: Readonly<Record<string, unknown>>) => unknown,
): T => {
  registerFieldMeta(schema, { compute: fn });
  return schema;
};

export const f = {
  pk,
  createdAt,
  updatedAt,
  deletedAt,
  version,
  owner,
  fk,
  string,
  int,
  bool,
  enum: enumField,
  compute,
} as const;
