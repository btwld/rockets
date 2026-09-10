import type { PlainLiteralObject, Type } from '@nestjs/common';
import { withOpenApi } from '@concepta/nestjs-core';
import { z } from 'zod';
import { schemaChildren } from '../common/utils/open-api-schema.util';
import type { ResourceRelationEntry } from '../index';
import { resolveRelationTarget } from './schema-registry';
import {
  asClassicSchema,
  isDbGenerated,
  readFieldMeta,
  relationPropertyFor,
  rocketsFieldMeta,
  type RocketsRelationTarget,
  unwrapField,
} from './field-meta';

export type ComputeFn = (row: Readonly<Record<string, unknown>>) => unknown;

export interface SchemaProjections {
  readonly create: Record<string, z.ZodType>;
  readonly update: Record<string, z.ZodType>;
  readonly response: Record<string, z.ZodType>;
  /** Response-only computed fields, keyed by response property. */
  readonly compute: Record<string, ComputeFn>;
  readonly pkKey: string | undefined;
  readonly relations: ReadonlyArray<ResourceRelationEntry<PlainLiteralObject>>;
}

export function projectSchema(
  resourceName: string,
  schema: z.ZodObject,
  entity: Type<PlainLiteralObject>,
  ownerColumns: ReadonlySet<string>,
): SchemaProjections {
  const create: Record<string, z.ZodType> = {};
  const update: Record<string, z.ZodType> = {};
  const response: Record<string, z.ZodType> = {};
  const compute: Record<string, ComputeFn> = {};
  const relations: ResourceRelationEntry<PlainLiteralObject>[] = [];
  let pkKey: string | undefined;

  for (const [key, field] of Object.entries(schema.shape)) {
    const path = `${resourceName}.${key}`;
    const { meta } = unwrapField(field, path);
    const relation = meta.relation;

    if (meta.compute !== undefined) {
      response[key] = withHiddenFieldsRemoved(field, path);
      compute[key] = meta.compute;
      continue;
    }

    if (relation?.kind === 'hasMany') {
      if (relation.expose === true) {
        const nested = exposedResponseSchema(
          relation.shape ?? relation.target,
          `${resourceName}${pascal(key)}ResponseDto`,
          path,
        );
        response[key] = z.array(nested).optional();
      }
      if (relation.include !== undefined) {
        relations.push({
          source: entity,
          target: () => resolveRelationTarget(relation.target, path),
          propertyName: key,
          include: relation.include,
        });
      }
      continue;
    }

    const generated = isDbGenerated(meta);
    const isPk = meta.db?.pk === true;
    if (isPk) {
      pkKey = key;
    }

    const isOwner = ownerColumns.has(key);

    if (!isOwner && (meta.dto?.create ?? !generated)) {
      create[key] = field;
    }
    if (
      !isOwner &&
      (isPk ? meta.dto?.update !== false : meta.dto?.update ?? !generated)
    ) {
      update[key] = field.optional();
    }
    if (isResponseExposed(meta)) {
      assertNotIsoDateTime(field, path);
      // A JSON column whose schema nests hidden fields strips them like a
      // computed field does — `dto: { response: false }` holds on every
      // response path, not only under `f.compute()`.
      response[key] = asStoredShape(withHiddenFieldsRemoved(field, path), path);
    }

    if (relation !== undefined) {
      const property = relationPropertyFor(key, relation, path);
      if (relation.expose === true) {
        const nested = exposedResponseSchema(
          relation.shape ?? relation.target,
          `${resourceName}${pascal(property)}ResponseDto`,
          path,
        );
        response[property] = nested.optional();
      }
      if (relation.include !== undefined) {
        relations.push({
          source: entity,
          target: () => resolveRelationTarget(relation.target, path),
          propertyName: property,
          include: relation.include,
        });
      }
    }
  }

  return { create, update, response, compute, pkKey, relations };
}

export function hasDeletedAtField(schema: z.ZodObject): boolean {
  return Object.entries(schema.shape).some(
    ([key, field]) => unwrapField(field, key).meta.db?.deletedAt === true,
  );
}

/**
 * A response-exposed `z.iso.datetime()` is a guaranteed 500: every
 * adapter hands rows back with `Date` objects (TypeORM natively, Firestore
 * via its timestamp normalisation), and the response schema validates the
 * row before it is serialized. Caught at definition time instead.
 */
function assertNotIsoDateTime(field: z.ZodType, path: string): void {
  const { base } = unwrapField(field, path);
  if (base instanceof z.ZodISODateTime) {
    throw new Error(
      `[zodResource] "${path}" is z.iso.datetime() and exposed on the ` +
        'response, but rows carry Date objects — the response schema would ' +
        'reject every row. Use f.date() for a writable datetime, ' +
        'f.createdAt() / f.updatedAt() / f.deletedAt() for audit columns, ' +
        'or z.date() directly.',
    );
  }
}

/**
 * Response projection of a relation target, as a NAMED component so the
 * parent's document `$ref`s it. Built once per (parent, property): the
 * instance embedded in the parent response is the one that carries the
 * id, which is what makes the reference resolve.
 */
function exposedResponseSchema(
  target: RocketsRelationTarget,
  id: string,
  path: string,
): z.ZodObject {
  const resolved = target();
  if (!(resolved instanceof z.ZodObject)) {
    throw new Error(
      `[zodResource] Relation at "${path}" sets expose:true but targets an ` +
        'entity class — only a zod schema target can be projected into the ' +
        'response document.',
    );
  }
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(resolved.shape)) {
    const { meta } = unwrapField(field, `${path}.${key}`);
    if (isResponseExposed(meta)) {
      assertNotIsoDateTime(field, `${path}.${key}`);
      shape[key] = asStoredShape(
        withHiddenFieldsRemoved(field, `${path}.${key}`),
        `${path}.${key}`,
      );
    }
  }
  return withOpenApi(z.object(shape), id);
}

/**
 * The response validates the ROW, and an optional field without a
 * default is a nullable column: a row that never set it reads back as
 * `null` (SQL) — not `undefined`. Declaring `.optional()` alone would make
 * the response schema reject every such row. The wire contract says what
 * the store actually returns: `null` is admitted; `undefined` (a plain
 * adapter that omits the key) still is.
 */
function asStoredShape(field: z.ZodType, path: string): z.ZodType {
  const { optional, nullable, hasDefault } = unwrapField(field, path);
  return optional && !nullable && !hasDefault ? field.nullable() : field;
}

/**
 * Response exposure is OPT-IN. A field reaches the response schema only
 * when it says so (`dto.response: true` — every `f.*` helper sets it) or
 * when it is a base-entity column (pk / createdAt / updatedAt /
 * deletedAt). Raw `z.string()` with no metadata stays hidden, so
 * forgetting to annotate fails closed.
 *
 * There is deliberately NO name-based heuristic. Guessing sensitivity
 * from an identifier substring is wrong in both directions — it eats
 * `hashtags` and `tokenExpiresAt` while waving through `apiKey`, `salt`
 * and `cardNumber` — and it cannot add safety on top of a default that
 * already fails closed. Keep secrets out with an explicit
 * `dto: { response: false }`.
 */
function isResponseExposed(
  meta: ReturnType<typeof unwrapField>['meta'],
): boolean {
  if (meta.dto?.response !== undefined) {
    return meta.dto.response;
  }
  return isBaseEntityResponseField(meta);
}

/**
 * A computed field's schema is an explicit wire declaration, so it is NOT
 * subject to the opt-in rule — the author already said what goes out.
 * But `dto: { response: false }` means "never on the wire", and that must
 * hold here too.
 *
 * It matters because compute schemas are routinely built FROM an entity
 * schema (`f.compute(z.array(tagSchema), …)`), which can carry columns
 * that were deliberately hidden. Without this, `response: false` was
 * honoured on the owning resource and silently ignored the moment the
 * same schema was projected through a computed field.
 *
 * Returns the field untouched when nothing is hidden, so the common case
 * keeps its exact original wrappers.
 */
export function withHiddenFieldsRemoved(
  field: z.ZodType,
  path: string,
): z.ZodType {
  // The FIELD is stripped, wrappers included: `stripHidden` rebuilds
  // optional / nullable / pipe (a top-level `z.preprocess`) around a
  // changed inner schema and rejects a top-level `.default()` / `.catch()`
  // like a nested one — peeling wrappers first and re-applying a hand-picked
  // subset is how a default (and then a preprocess) got silently dropped.
  const stripped = stripHidden(field, path);
  if (stripped === field) {
    return field;
  }
  // The rebuilt node is a NEW zod instance; re-registering keeps the
  // field meta readable on the response shape (`readFieldMetaDeep`).
  rocketsFieldMeta.add(stripped, unwrapField(field, path).meta);
  return stripped;
}

/** Non-throwing form of {@link assertNoHiddenFields} for the route audit. */
export function hasHiddenResponseField(
  schema: z.ZodType,
  path: string,
): boolean {
  return hasHiddenDescendant(schema, path);
}

/**
 * A HAND-WRITTEN response schema (`dto.response`, `operations.*.output`,
 * `userMetadata.responseSchema`) is the author's wire declaration and
 * carries the component id the author chose — it cannot be rebuilt
 * without losing that id, so a `dto: { response: false }` field inside
 * it is a contradiction the author resolves: fail at definition time and
 * point at `.omit()`.
 */
export function assertNoHiddenFields(schema: z.ZodType, context: string): void {
  if (!hasHiddenDescendant(schema, context)) return;
  throw new Error(
    `${context}: this hand-written response schema contains a field ` +
      `declared \`dto: { response: false }\`, which would reach the wire. ` +
      `A hand-written response is not projected — drop the column with ` +
      `.omit({ field: true }) (then wrap LAST with withOpenApi()), or let ` +
      `the resource project it (zodResource / f.compute).`,
  );
}

/**
 * Does any object below this node declare a `dto: { response: false }`
 * field? Walks every wrapper through the shared `schemaChildren` walker,
 * with cycle protection for recursive (lazy) schemas.
 */
function hasHiddenDescendant(
  schema: z.ZodType,
  path: string,
  seen: Set<z.ZodType> = new Set(),
): boolean {
  if (seen.has(schema)) return false;
  seen.add(schema);
  // The marker is read on EVERY node, not only on direct object
  // properties. `f.string({ dto: { response: false } })` registers it on
  // the node the helper returns, and anything the author writes after
  // that — `.readonly()`, `.nonoptional()`, `.prefault()`, `.catch()`,
  // `z.array(...)`, `.transform()` — leaves it one level down where a
  // property-only check cannot see it, and where the recursive walk
  // below cannot recover it either because the marked node is a bare
  // leaf with no children of its own.
  if (readFieldMeta(schema).dto?.response === false) {
    return true;
  }
  if (schema instanceof z.ZodObject) {
    for (const [key, field] of Object.entries(schema.shape)) {
      const fieldPath = `${path}.${key}`;
      if (unwrapField(field, fieldPath).meta.dto?.response === false) {
        return true;
      }
      if (
        hasHiddenDescendant(asClassicSchema(field, fieldPath), fieldPath, seen)
      ) {
        return true;
      }
    }
    return false;
  }
  return schemaChildren(schema, path).some(([childPath, child]) =>
    hasHiddenDescendant(asClassicSchema(child, childPath), childPath, seen),
  );
}

/**
 * Is this FIELD hidden — the marker anywhere on the chain of nodes that
 * carry the same value? `unwrapField` peels the wrappers it knows
 * (optional / nullable / default / non-transform pipe); this peels every
 * single-child wrapper through the shared `innerType` slot, plus arrays:
 * a list of a hidden value is hidden, and dropping the property is the
 * only way to keep it off the wire.
 *
 * Stops at an object, union or intersection — a hidden column INSIDE
 * those is stripped in place, not by removing the property that holds
 * them.
 */
function fieldIsHidden(field: z.ZodType, path: string): boolean {
  let current: z.ZodType = field;
  for (let depth = 0; depth < HIDDEN_PEEL_LIMIT; depth += 1) {
    if (readFieldMeta(current).dto?.response === false) return true;
    const { base, meta } = unwrapField(current, path);
    if (meta.dto?.response === false) return true;
    if (base instanceof z.ZodArray) {
      current = asClassicSchema(base.element, `${path}[]`);
      continue;
    }
    const inner: unknown = Reflect.get(base.def, 'innerType');
    if (inner instanceof z.ZodType) {
      current = inner;
      continue;
    }
    return false;
  }
  throw new Error(
    `${path}: wrapper depth exceeded while reading response visibility — ` +
      `circular schema?`,
  );
}

/** Same bound as `MAX_WRAPPER_DEPTH` in `field-meta.ts`. */
const HIDDEN_PEEL_LIMIT = 16;

/**
 * Recursive: a hidden column N levels down stays hidden, whatever wraps
 * it. Every composite the projection can rebuild FAITHFULLY — object,
 * array, optional / nullable / prefault / readonly / nonoptional, union,
 * intersection, pipe (both sides), lazy — is rebuilt when something
 * underneath changed (identity is preserved when nothing was hidden). A
 * hidden field below anything else fails at DEFINITION time: `.default()`
 * / `.catch()` hand their payload over without running the inner schema,
 * and discriminated union / tuple / record / map / set cannot be rebuilt
 * without changing semantics — silently leaving any of them in place is
 * how an explicitly hidden column reaches the wire.
 */
const rebuiltLazies = new WeakMap<z.ZodLazy, z.ZodLazy>();

function stripHidden(schema: z.ZodType, path: string): z.ZodType {
  if (schema instanceof z.ZodObject) {
    return stripHiddenObject(schema, path);
  }
  if (schema instanceof z.ZodArray) {
    const element = asClassicSchema(schema.element, `${path}[]`);
    const stripped = stripHidden(element, `${path}[]`);
    return stripped === element ? schema : z.array(stripped);
  }
  if (schema instanceof z.ZodOptional) {
    const inner = asClassicSchema(schema.unwrap(), path);
    const stripped = stripHidden(inner, path);
    return stripped === inner ? schema : stripped.optional();
  }
  if (schema instanceof z.ZodNullable) {
    const inner = asClassicSchema(schema.unwrap(), path);
    const stripped = stripHidden(inner, path);
    return stripped === inner ? schema : stripped.nullable();
  }
  // NOT rebuilt: `.default(value)` / `.catch(value)` hand their payload to
  // the caller WITHOUT running the inner schema (zod short-circuits), so a
  // stripped inner schema would not strip the payload — a hidden column in
  // the default value ships. They fall through to the definition-time
  // rejection below when a hidden field sits under them.
  if (schema instanceof z.ZodPrefault) {
    // Unlike `.default()`, a prefault payload DOES run through the inner
    // schema, so the rebuilt inner strips it — rebuildable.
    const inner = asClassicSchema(schema.def.innerType, path);
    const stripped = stripHidden(inner, path);
    return stripped === inner
      ? schema
      : stripped.prefault(schema.def.defaultValue);
  }
  if (schema instanceof z.ZodReadonly) {
    const inner = asClassicSchema(schema.def.innerType, path);
    const stripped = stripHidden(inner, path);
    return stripped === inner ? schema : stripped.readonly();
  }
  if (schema instanceof z.ZodNonOptional) {
    const inner = asClassicSchema(schema.def.innerType, path);
    const stripped = stripHidden(inner, path);
    return stripped === inner ? schema : stripped.nonoptional();
  }
  if (
    schema instanceof z.ZodUnion &&
    !(schema instanceof z.ZodDiscriminatedUnion)
  ) {
    const options = schema.options.map((option, index) =>
      asClassicSchema(option, `${path}|${index}`),
    );
    const stripped = options.map((option, index) =>
      stripHidden(option, `${path}|${index}`),
    );
    return stripped.every((option, index) => option === options[index])
      ? schema
      : z.union(stripped);
  }
  if (schema instanceof z.ZodIntersection) {
    const left = asClassicSchema(schema.def.left, `${path}&0`);
    const right = asClassicSchema(schema.def.right, `${path}&1`);
    const strippedLeft = stripHidden(left, `${path}&0`);
    const strippedRight = stripHidden(right, `${path}&1`);
    return strippedLeft === left && strippedRight === right
      ? schema
      : z.intersection(strippedLeft, strippedRight);
  }
  if (schema instanceof z.ZodPipe) {
    const input = asClassicSchema(schema.def.in, `${path}<in`);
    const output = asClassicSchema(schema.def.out, path);
    const strippedIn = stripHidden(input, `${path}<in`);
    const strippedOut = stripHidden(output, path);
    return strippedIn === input && strippedOut === output
      ? schema
      : z.pipe(strippedIn, strippedOut);
  }
  if (schema instanceof z.ZodLazy) {
    const cached = rebuiltLazies.get(schema);
    if (cached !== undefined) return cached;
    if (!hasHiddenDescendant(schema, path)) return schema;
    // ONE rebuilt lazy per source instance, registered BEFORE its getter
    // can run: a recursive schema reaches this same node again through
    // its own getter and must get the same rebuilt instance back, or every
    // walker's cycle protection (keyed on node identity) loops forever.
    const rebuilt: z.ZodLazy = z.lazy(() =>
      stripHidden(asClassicSchema(schema.unwrap(), path), path),
    );
    rebuiltLazies.set(schema, rebuilt);
    // Forced once, HERE. The getter is where a hidden node the projection
    // cannot rebuild throws, and a lazy defers that to the first request
    // the route serves — a definition-time error arriving as a 500 in
    // production. Nothing new is evaluated: `hasHiddenDescendant` above
    // already ran the source getter, and the cache line above makes the
    // recursive re-entry terminate.
    rebuilt.unwrap();
    return rebuilt;
  }
  if (hasHiddenDescendant(schema, path)) {
    throw new Error(
      `${path}: a field declared \`dto: { response: false }\` sits below a ` +
        `${schema.constructor.name} wrapper the response projection cannot ` +
        `rebuild, so it would reach the wire. Rebuilt wrappers: object, ` +
        `array, optional, nullable, prefault, readonly, nonoptional, union, ` +
        `intersection, pipe, lazy. Not rebuilt: default / catch (their ` +
        `payload bypasses the inner schema), discriminated union, tuple, ` +
        `record, map, set. Move the hidden column out of this schema or ` +
        `restructure the wrapper.`,
    );
  }
  return schema;
}

function stripHiddenObject(schema: z.ZodObject, path: string): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  let changed = false;
  for (const [key, field] of Object.entries(schema.shape)) {
    const fieldPath = `${path}.${key}`;
    // Read through the wrappers, not just the ones `unwrapField` peels:
    // `secret().readonly()` is the same hidden column, and leaving the
    // property in place would hand it to the rebuild below, which can
    // only throw about a leaf it is not allowed to drop.
    if (fieldIsHidden(field, fieldPath)) {
      changed = true;
      continue;
    }
    const stripped = stripHidden(asClassicSchema(field, fieldPath), fieldPath);
    if (stripped !== field) changed = true;
    shape[key] = stripped;
  }
  return changed ? z.object(shape) : schema;
}

function isBaseEntityResponseField(
  meta: ReturnType<typeof unwrapField>['meta'],
): boolean {
  const db = meta.db;
  if (db === undefined) {
    return false;
  }
  return (
    db.pk === true ||
    db.createdAt === true ||
    db.updatedAt === true ||
    db.deletedAt === true
  );
}

function pascal(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
