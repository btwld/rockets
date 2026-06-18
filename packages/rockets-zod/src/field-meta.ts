import { z } from 'zod';

/**
 * Namespaced per-field metadata carried in a CUSTOM zod registry —
 * never `.meta()`. `.meta()` writes to `z.globalRegistry`, which
 * `z.toJSONSchema` (and therefore nestjs-zod's OpenAPI generation)
 * merges verbatim into the JSON Schema output: a `db` namespace placed
 * there leaks into the public Swagger document. The custom registry is
 * invisible to JSON Schema generation by design.
 *
 * API-facing extras (`example`, `description`, `title`, `deprecated`)
 * use native `.meta()` directly — they are standard JSON Schema keys
 * and SHOULD land in the document.
 *
 * Three namespaces, three concerns:
 * - `db`       — persistence hints (read by the entity compiler).
 * - `dto`      — per-DTO field roles (which of create/update/response
 *                projections include the field).
 * - `relation` — cross-resource relation declared on the FK field,
 *                referencing another zod schema (or an entity class).
 *
 * Ordering caveat: zod schemas are immutable — every chained call
 * returns a NEW instance, and the registry entry stays on the instance
 * that registered it. Call `.register(rocketsFieldMeta, ...)` LAST,
 * after `.meta()`/`.refine()`/checks (wrappers like `.optional()` may
 * come after — `readFieldMetaDeep`/`unwrapField` unwrap them).
 *
 * This module is intentionally isomorphic: it imports zod and nothing
 * else, so frontend code can consume the same schemas + metadata.
 */
export interface RocketsDbFieldMeta {
  /** Primary key — becomes the identifier field on update DTOs. */
  readonly pk?: boolean;
  /**
   * Value produced by the persistence layer (generated PK,
   * created/updated timestamps). Excluded from create/update DTOs
   * unless an explicit `dto` role overrides it.
   */
  readonly generated?: boolean;
  readonly index?: boolean;
  /** UNIQUE column constraint. */
  readonly unique?: boolean;
  /** Maps to `@CreateDateColumn` (implies `generated`). */
  readonly createdAt?: boolean;
  /** Maps to `@UpdateDateColumn` (implies `generated`). */
  readonly updatedAt?: boolean;
  /**
   * Maps to `@DeleteDateColumn` (implies `generated`). Required on
   * exactly one field when the resource enables `delete: { soft: true }`.
   */
  readonly deletedAt?: boolean;
  /**
   * Raw column options merged LAST over the zod-derived ones — the
   * escape hatch for anything the type mapping cannot express
   * (`{ type: 'decimal', precision: 10, scale: 2 }`, `{ type: 'text' }`,
   * `{ type: 'json' }`, collation, comments…). Typed loosely on purpose:
   * this module stays ORM-agnostic; the persistence compiler interprets
   * the object as its adapter's column options (TypeORM
   * `ColumnOptions` today).
   */
  readonly column?: Readonly<Record<string, unknown>>;
}

/**
 * Per-DTO field roles. Defaults when omitted:
 * - `create` / `update` — `true` unless the field is db-generated
 *   (`generated` / `createdAt` / `updatedAt`).
 * - `response` — always `true`.
 *
 * Explicit values always win over the derived default, so a
 * server-assigned field can still be opted into create
 * (`{ dto: { create: true } }`) and a secret column can be kept out of
 * responses (`{ dto: { response: false } }`).
 */
export interface RocketsDtoFieldMeta {
  readonly create?: boolean;
  readonly update?: boolean;
  readonly response?: boolean;
}

/**
 * Relation target: another zod schema (its GENERATED entity is looked
 * up at resolution time) or a concrete entity class. Always a thunk —
 * relation graphs are circular by nature and the target module may not
 * have finished loading when this field meta is declared.
 *
 * Typed `() => unknown` ON PURPOSE: zod's registry metadata type runs
 * through the recursive `$replace` mapped type, which walks the entire
 * `ZodObject` type graph when it appears in a function return — a
 * guaranteed TS2589 (excessively deep instantiation). The thunk result
 * is narrowed at resolution time (`instanceof z.ZodObject` / entity
 * class guard) with a clear boot-time error for anything else.
 */
export type RocketsRelationTarget = () => unknown;

/**
 * Cross-resource relation declared on the FK field (a `z.uuid()`
 * column, e.g. `authorId`). Drives three things:
 *
 * 1. **Entity** — the generated entity gains the FK column AND a
 *    `@ManyToOne(target)` + `@JoinColumn({ name: fkField })` relation
 *    property.
 * 2. **DTOs / Swagger** — the FK stays a plain uuid in create/update;
 *    with `expose: true` the response DTO additionally carries the
 *    target's response projection as a nested object (and the entity
 *    relation becomes eager so runtime rows match the document).
 * 3. **defineResource** — when `include` is set, a
 *    `ResourceRelationEntry` is contributed so list/read joins and the
 *    planner's cross-resource validation see the relation, exactly as
 *    a handwritten `relations: (relation) => [...]` would.
 */
export interface RocketsRelationFieldMeta {
  /**
   * Cardinality. Default: `'manyToOne'`.
   *
   * - `manyToOne` / `oneToOne` — declared on the FK `z.uuid()` field;
   *   the entity gains the FK column + the relation property
   *   (`@JoinColumn` on this side).
   * - `hasMany` — declared on a `z.array(childSchema)` field; the field
   *   becomes a `@OneToMany` relation property (NO column). Requires
   *   `mappedBy`. Excluded from create/update; projected into the
   *   response only with `expose: true`. Many-to-many is intentionally
   *   NOT a kind — model it as an explicit junction resource
   *   (`hasMany` junction + two `manyToOne`s), the repo idiom.
   */
  readonly kind?: 'manyToOne' | 'oneToOne' | 'hasMany';
  /** Target schema or entity class (thunk — see {@link RocketsRelationTarget}). */
  readonly target: RocketsRelationTarget;
  /**
   * Relation property name on the entity. Default: FK field name minus
   * the `Id` suffix (`authorId` → `author`). Required when the FK field
   * does not end in `Id`. Ignored for `hasMany` (the field key IS the
   * relation property).
   */
  readonly property?: string;
  /**
   * `hasMany` only — the FK field on the CHILD schema that points back
   * here (e.g. `'petId'`). Drives the `@OneToMany` inverse side
   * (`petId` → child property `pet`).
   */
  readonly mappedBy?: string;
  /**
   * Response projection shape override for `expose` — REQUIRED when
   * `target` is an entity class (a class has no schema to project).
   * Lets a zod resource expose relations to classic handwritten
   * entities with an explicit zod mirror of their wire shape.
   */
  readonly shape?: RocketsRelationTarget;
  /**
   * Project the target's response shape into this resource's response
   * DTO under {@link property}. Implies an eager entity relation so the
   * documented shape and the runtime rows agree. Requires the target to
   * be a zod schema (an entity class has no schema to project).
   */
  readonly expose?: boolean;
  /** Eager-load the relation. Default: `false` (or `true` when `expose`). */
  readonly eager?: boolean;
  /** FK delete behavior. Default: adapter default. */
  readonly onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  /**
   * When set, a relation entry is contributed to `defineResource`
   * (`'default'` joins it on list/read; `'never'` registers it for
   * persistence/validation only). Omit to keep the relation purely at
   * the entity level.
   */
  readonly include?: 'default' | 'never';
}

export interface RocketsFieldMeta {
  readonly db?: RocketsDbFieldMeta;
  readonly dto?: RocketsDtoFieldMeta;
  readonly relation?: RocketsRelationFieldMeta;
  /**
   * Response-only COMPUTED field: no column, never writable, projected
   * into the response by running this function over the raw row (after
   * relations were eager-loaded). The field's zod type documents the
   * computed shape in OpenAPI. Canonical use: the pet's flat `tags`
   * array projected from the eager `petTags` junction rows.
   */
  readonly compute?: (row: Readonly<Record<string, unknown>>) => unknown;
  /**
   * Mark this (string) field as the resource OWNER column. The zod
   * resource layer auto-wires an `OwnerStampHook` for it — `beforeCreate`
   * / `beforeUpdate` stamp the field from the authenticated actor and
   * reject client-supplied values. A pure flag (no class import), so the
   * schema stays isomorphic; the server layer maps it to the hook.
   * Override at the resource with `ownerStamp: false` (then wire a custom
   * hook by hand).
   */
  readonly owner?: boolean;
}

export const rocketsFieldMeta = z.registry<RocketsFieldMeta>();

/**
 * ENTITY-level metadata, registered on the OBJECT schema itself
 * (`z.object({...}).register(rocketsEntityMeta, {...})`) — zod's native
 * mechanism for schema-scoped data. Carries what no single field can
 * express:
 * - `unique`   — composite UNIQUE constraints (`[['petId','tagId']]`).
 * - `indexes`  — composite indexes.
 */
export interface RocketsEntityMeta {
  readonly unique?: ReadonlyArray<ReadonlyArray<string>>;
  readonly indexes?: ReadonlyArray<ReadonlyArray<string>>;
}

export const rocketsEntityMeta = z.registry<RocketsEntityMeta>();

export function readEntityMeta(schema: z.ZodObject): RocketsEntityMeta {
  return rocketsEntityMeta.get(schema) ?? {};
}

/**
 * Read the namespaced metadata registered on a schema node. Returns an
 * empty object when no metadata is registered.
 */
export function readFieldMeta(schema: z.ZodType): RocketsFieldMeta {
  return rocketsFieldMeta.get(schema) ?? {};
}

const MAX_WRAPPER_DEPTH = 16;

/**
 * Narrows a core `$ZodType` (returned by `.unwrap()` / `def.innerType` /
 * `.element`) back to the classic `z.ZodType` API. Every schema built
 * through the classic `z.*` factories is a classic instance, so this is
 * a true runtime guard, not a cast.
 */
export function asClassicSchema(
  value: z.core.$ZodType,
  context: string,
): z.ZodType {
  if (value instanceof z.ZodType) {
    return value;
  }
  throw new Error(
    `[zod-layer] Expected a classic zod schema at ${context} — got a bare ` +
      'core $ZodType. Build schemas with the classic `z.*` factories.',
  );
}

/**
 * Read metadata across Optional/Nullable/Default wrappers, merging from
 * the outermost node inward (outer wins). Authors may call `.register()`
 * before or after `.optional()` — both must work.
 */
export function readFieldMetaDeep(schema: z.ZodType): RocketsFieldMeta {
  return unwrapField(schema, 'readFieldMetaDeep').meta;
}

export interface UnwrappedField {
  readonly base: z.ZodType;
  readonly optional: boolean;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  readonly defaultValue: unknown;
  readonly meta: RocketsFieldMeta;
}

/**
 * Peels Optional/Nullable/Default wrappers, merging registry metadata
 * from the outermost node inward (outer wins).
 */
export function unwrapField(field: z.ZodType, path: string): UnwrappedField {
  let current: z.ZodType = field;
  let optional = false;
  let nullable = false;
  let hasDefault = false;
  let defaultValue: unknown;
  let meta: RocketsFieldMeta = {};
  let depth = 0;

  for (;;) {
    if (depth++ > MAX_WRAPPER_DEPTH) {
      throw new Error(
        `[zod-layer] Wrapper depth exceeded at "${path}" — circular schema?`,
      );
    }
    meta = { ...readFieldMeta(current), ...meta };

    if (current instanceof z.ZodOptional) {
      optional = true;
      current = asClassicSchema(current.unwrap(), path);
      continue;
    }
    if (current instanceof z.ZodNullable) {
      nullable = true;
      current = asClassicSchema(current.unwrap(), path);
      continue;
    }
    if (current instanceof z.ZodDefault) {
      hasDefault = true;
      defaultValue = current.def.defaultValue;
      current = asClassicSchema(current.def.innerType, path);
      continue;
    }
    break;
  }

  return { base: current, optional, nullable, hasDefault, defaultValue, meta };
}

/**
 * Whether the persistence layer produces this field's value (generated
 * pk, created/updated timestamps).
 */
export function isDbGenerated(meta: RocketsFieldMeta): boolean {
  const db = meta.db;
  return (
    db?.generated === true ||
    db?.createdAt === true ||
    db?.updatedAt === true ||
    db?.deletedAt === true
  );
}

/**
 * Resolve the entity relation property name for a relation declared on
 * an FK field: explicit `property`, else strip the `Id` suffix.
 */
export function relationPropertyFor(
  fieldKey: string,
  relation: RocketsRelationFieldMeta,
  path: string,
): string {
  if (relation.property !== undefined) {
    return relation.property;
  }
  if (fieldKey.endsWith('Id') && fieldKey.length > 2) {
    return fieldKey.slice(0, -2);
  }
  throw new Error(
    `[zod-layer] Relation at "${path}" needs an explicit "property": the ` +
      `FK field "${fieldKey}" does not end in "Id", so the relation ` +
      'property name cannot be derived.',
  );
}
