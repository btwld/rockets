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
 * Apply `.meta()` (when there is API-facing text) and field-meta
 * registration (response opt-in + any db/dto knobs) to a built schema,
 * preserving its precise type.
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
  // Scalar helpers opt into the response DTO by default — private fields
  // pass `dto: { response: false }`. Raw `z.string()` without meta stays
  // hidden (opt-in projection in projectSchema).
  const meta: RocketsFieldMeta = {
    ...(Object.keys(db).length > 0 ? { db } : {}),
    dto: { response: true, ...o.dto },
  };
  registerFieldMeta(result, meta);
  return result;
}

// --- Identity / audit columns -------------------------------------------

/** uuid primary key, db-generated. */
const pk = () =>
  z.uuid().register(rocketsFieldMeta, { db: { pk: true, generated: true } });

/**
 * `@CreateDateColumn` — a `Date` in rows (what every adapter returns),
 * an ISO string on the wire (JSON encoding), `string/date-time` in
 * OpenAPI.
 */
const createdAt = () =>
  z.date().register(rocketsFieldMeta, { db: { createdAt: true } });

/** `@UpdateDateColumn`. */
const updatedAt = () =>
  z.date().register(rocketsFieldMeta, { db: { updatedAt: true } });

/** `@DeleteDateColumn` — nullable + optional so soft-deleted rows validate. */
const deletedAt = () =>
  z
    .date()
    .register(rocketsFieldMeta, { db: { deletedAt: true } })
    .nullable()
    .optional();

const isDateInput = (value: unknown): value is string | number | Date =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  value instanceof Date;

/**
 * Writable datetime column. Accepts an ISO string (or a `Date`) on the
 * way in and yields a `Date` — the row shape — so a request body, a hook
 * and a loaded row all agree. Documented as `string/date-time`; the
 * response emits the ISO string. Accepts numeric timestamps too
 * (`z.coerce.date()` semantics) — a documented trade-off, not a feature.
 *
 * Bare `z.coerce.date()` would also coerce `null` and booleans to the
 * epoch (`new Date(null)` is 1970) and persist them. The input guard in
 * front of the coercion rejects anything that is not a string, number or
 * `Date`. It is a `z.custom` (not `z.preprocess`) on purpose: a
 * transform is optional-in for zod, which would drop the field from the
 * documented `required` list. The guard's `.meta()` keeps the input side
 * documented as `string/date-time`; `unwrapField` sees through the pipe
 * to the `ZodDate`, so column mapping and projections are unchanged.
 */
const date = (o: FieldOpts = {}) =>
  decorate(
    z
      .custom<string | number | Date>(isDateInput, {
        message: 'Expected an ISO 8601 datetime string',
      })
      .meta({ type: 'string', format: 'date-time' })
      .pipe(z.coerce.date()),
    o,
  );

/** Optimistic-lock counter — excluded from create/update DTOs. */
const version = () =>
  z
    .int()
    .default(1)
    .register(rocketsFieldMeta, {
      dto: { create: false, update: false, response: true },
    });

/** `f.owner` options — only the response role is configurable. */
interface OwnerOpts {
  /**
   * Per-projection DTO roles. Only `response` is honoured: create and
   * update are decided by the owner-column projection rule (the server
   * stamps the value; a client-supplied one is rejected), so overriding
   * them here would be silently ignored.
   */
  readonly dto?: Pick<RocketsDtoFieldMeta, 'response'>;
}

/**
 * Owner column (uuid). Marks the field `{ owner: true }` so the zod
 * resource layer auto-wires `OwnerStampHook` + `OwnerScopeHook` for it.
 * Always excluded from create/update via the owner-column projection
 * rule. Combine with the resource-level `owner: 'fieldName'` if declared
 * both ways — the two dedupe.
 *
 * **Exposed on the response by default**, matching how mainstream APIs
 * return an owner reference (GitHub `owner.id`, Stripe `customer`): the
 * UI needs a stable key to group rows by author and to answer "is this
 * mine?" without an extra round-trip. The value is an opaque,
 * non-sequential uuid, so it is not enumerable.
 *
 * Opt out where the owner id has no business on the wire — typically a
 * resource with `ownerScope: false` whose rows are visible to people
 * other than the owner (public catalogue, shared team board):
 *
 * ```ts
 * userId: f.owner({ dto: { response: false } })
 * ```
 */
const owner = (o: OwnerOpts = {}) =>
  z.uuid().register(rocketsFieldMeta, {
    owner: true,
    dto: { response: o.dto?.response ?? true },
  });

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
    dto: { response: true, ...dto },
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
 * documents its shape in OpenAPI AND validates the value at
 * serialization time. The `row` parameter is typed here, so the callback
 * needs no annotation — unlike a raw `rocketsFieldMeta` registration with
 * a `compute` callback inside a generic composer, where contextual typing
 * breaks and forces a manual `row` type.
 *
 * The RETURN must be the schema's output: date columns are `Date`
 * (`f.date()`, `f.createdAt()`), so a computed value built from loaded
 * rows matches without conversion. Undeclared keys are stripped by the
 * response schema; a wrong value type is a loud 500, never a silently
 * coerced payload.
 */
const compute = <T extends z.ZodType>(
  schema: T,
  fn: (row: Readonly<Record<string, unknown>>) => z.output<T>,
): T => {
  registerFieldMeta(schema, { compute: fn });
  return schema;
};

/** `f.hasMany` options: relation meta (minus `target` / `kind`) — see {@link fk}. */
interface HasManyOpts
  extends Omit<RocketsRelationFieldMeta, 'target' | 'kind'> {
  /**
   * Related zod schema or entity class (thunk). Defaults to
   * `elementSchema` when it is a `z.object()` — pass explicitly for
   * classic entity targets or when the array element is a wire-shape
   * mirror (`shape` / `expose`).
   */
  readonly target?: RocketsRelationFieldMeta['target'];
}

/**
 * `@OneToMany` inverse side: typed `z.array(elementSchema)` plus relation
 * meta. Prefer this over `z.array(z.unknown()).register(...)` — the
 * element schema documents and validates the collection shape.
 */
const hasMany = <T extends z.ZodType>(
  elementSchema: T,
  o: HasManyOpts,
): z.ZodArray<T> => {
  const { target: targetOverride, ...relationRest } = o;
  const target: RocketsRelationFieldMeta['target'] =
    targetOverride ??
    ((): unknown => {
      if (elementSchema instanceof z.ZodObject) {
        return elementSchema;
      }
      throw new Error(
        '[f.hasMany] "target" is required when elementSchema is not a z.object().',
      );
    });
  const arraySchema = z.array(elementSchema);
  registerFieldMeta(arraySchema, {
    relation: { kind: 'hasMany', target, ...relationRest },
  });
  return arraySchema;
};

export const f = {
  pk,
  createdAt,
  updatedAt,
  deletedAt,
  version,
  owner,
  fk,
  hasMany,
  string,
  int,
  bool,
  date,
  enum: enumField,
  compute,
} as const;
