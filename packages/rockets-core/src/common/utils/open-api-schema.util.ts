import { withOpenApi } from '@concepta/nestjs-core';
import { paginatedSchema } from '@concepta/nestjs-crud';
import { z } from 'zod';
import { asClassicSchema } from '../../zod/field-meta';

/** The OpenAPI component id a schema carries (`schema.meta({ id })`). */
export function readSchemaId(schema: z.ZodType): string | undefined {
  const id: unknown = schema.meta()?.id;
  return typeof id === 'string' ? id : undefined;
}

function isObjectLike(value: unknown): value is Record<PropertyKey, unknown> {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}

/** Whether `withOpenApi()` attached the JSON Schema bridge to this schema. */
export function isOpenApiBridged(schema: z.ZodType): boolean {
  const jsonSchema: unknown = Reflect.get(schema['~standard'], 'jsonSchema');
  return (
    isObjectLike(jsonSchema) &&
    typeof jsonSchema.input === 'function' &&
    typeof jsonSchema.output === 'function'
  );
}

/**
 * Asserts a schema is a NAMED OpenAPI component: it carries an id AND the
 * JSON Schema bridge, on THIS instance.
 *
 * Both are checked because the bridge alone lies: every chained call after
 * `withOpenApi()` (`.extend()`, `.strict()`, `.optional()`, `.array()`,
 * `.pick()`, …) returns a clone that drops the id but keeps a bridge bound
 * to the ORIGINAL shape — the document would describe a schema the route no
 * longer validates with. Requiring the id catches every wrap-not-last.
 */
export function assertNamedSchema(
  schema: unknown,
  context: string,
): asserts schema is z.ZodType {
  if (!(schema instanceof z.ZodType)) {
    throw new Error(
      `${context}: expected a zod schema, got ${describeValue(schema)}.`,
    );
  }
  if (readSchemaId(schema) === undefined || !isOpenApiBridged(schema)) {
    throw new Error(
      `${context}: schema is not a named OpenAPI component. Wrap it LAST ` +
        `with withOpenApi(schema, 'ComponentName') — any call chained after ` +
        `the wrap (.extend(), .strict(), .optional(), .array(), .pick(), …) ` +
        `returns a clone without the id.`,
    );
  }
}

function describeValue(value: unknown): string {
  if (typeof value === 'function') return `class/function ${value.name}`;
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Response schemas must STRIP undeclared keys. Three shapes fail that,
 * and all three are rejected here:
 *
 * - `.passthrough()` / `.catchall()` on an object — it ships whatever the
 *   row carries, hidden columns and a joined relation's secrets included.
 * - A ROOT that is a `record` / `map` with a pass-through value
 *   (`z.unknown()`, `z.any()`, `z.custom()`, a transform, or a composite
 *   holding one). Undeclared keys AND unconstrained values, applied to
 *   the whole response, is `.passthrough()` written a different way: the
 *   serializer hands the entire row through, hidden columns included.
 * - A ROOT that is itself one of those pass-through nodes: nothing at all
 *   is declared.
 *
 * "Root" is a POSITION, not a node: it survives every wrapper that names
 * no key — `optional` / `nullable` / `readonly` / `catch` / a lazy, an
 * array's or set's element, a union branch, either side of an
 * intersection, a pipe's out side. `z.array(z.unknown())` ships each row
 * verbatim exactly like a bare `z.unknown()` does. The root ENDS at an
 * object or a TUPLE — a tuple declares each position, the way an object
 * declares each key, so `z.tuple([z.unknown()])` is the author's call
 * about one slot rather than an open door:
 * inside a declared property — a `z.object()` whose `profile` field is a
 * `z.record(z.string(), z.unknown())`, the shape of a JSON column — the
 * author named the key and chose what its value may be. That is a decision about one field's
 * contents, not an open door onto the row, and rejecting it would make a
 * JSON column unserializable.
 *
 * The walk covers every node that can hold another schema — objects,
 * arrays, tuples, unions, intersections, record / map / set values, pipes
 * (the `out` side of a `z.preprocess`), lazies and every single-child
 * wrapper (`optional`, `nullable`, `default`, `readonly`, `catch`, …).
 */
export function assertFailClosedResponse(
  schema: z.ZodType,
  context: string,
): void {
  const open = findOpenResponseObject(schema);
  if (open !== undefined) {
    throw new Error(
      `${context}: response schema is open at "${open}" — an object with ` +
        `.passthrough() / .catchall(), or a pass-through (unknown / any / ` +
        `custom / transform) in root position, a record/map of one ` +
        `included. Response schemas must strip undeclared keys — declare ` +
        `the keys you want on the wire; a record at the root needs an ` +
        `explicit value type (z.json() for arbitrary JSON).`,
    );
  }
}

/**
 * The path of the first open node in a response schema, or `undefined`
 * when it strips everywhere. Non-throwing form of
 * {@link assertFailClosedResponse} for callers that report instead of
 * failing (the route audit).
 */
export function findOpenResponseObject(schema: z.ZodType): string | undefined {
  return (
    openRootPath(schema, new Set(), '$') ??
    findOpenObject(schema, new Set(), '$')
  );
}

/**
 * ROOT POSITION is not one node: it survives every wrapper that does not
 * name a key. `z.unknown()` is rejected, so `z.unknown().optional()`,
 * `z.array(z.unknown())`, `z.lazy(() => z.unknown())` and
 * `z.union([closed, z.unknown()])` have to be too — each of them ships
 * the value it is handed, verbatim, with nothing declared. An object or
 * a tuple ENDS the root: from there on the author has named the keys (or
 * the positions), and what a declared field may hold is their choice.
 */
function openRootPath(
  schema: z.ZodType,
  seen: Set<z.ZodType>,
  path: string,
): string | undefined {
  if (seen.has(schema)) return undefined;
  seen.add(schema);

  // Node-local, NOT `passesThrough`: that one reports any composite
  // holding a pass-through somewhere below it, which would condemn every
  // response with a JSON column in it.
  if (isPassThroughNode(schema)) return path;

  if (schema instanceof z.ZodRecord || schema instanceof z.ZodMap) {
    const valuePath = `${path}[*]`;
    const value = asClassicSchema(schema.def.valueType, valuePath);
    // `passesThrough` is right HERE: under undeclared keys, a value that
    // hands any of its input through is the whole row on the wire.
    return passesThrough(value, valuePath) ? valuePath : undefined;
  }
  if (schema instanceof z.ZodArray) {
    const elementPath = `${path}[]`;
    return openRootPath(
      asClassicSchema(schema.element, elementPath),
      seen,
      elementPath,
    );
  }
  if (schema instanceof z.ZodSet) {
    const valuePath = `${path}[]`;
    return openRootPath(
      asClassicSchema(schema.def.valueType, valuePath),
      seen,
      valuePath,
    );
  }
  if (schema instanceof z.ZodUnion) {
    for (const [index, option] of schema.options.entries()) {
      const optionPath = `${path}|${index}`;
      const open = openRootPath(
        asClassicSchema(option, optionPath),
        seen,
        optionPath,
      );
      if (open !== undefined) return open;
    }
    return undefined;
  }
  if (schema instanceof z.ZodIntersection) {
    // Both sides parse and the results are merged, so an open side puts
    // the keys the closed side stripped straight back on the wire.
    return (
      openRootPath(
        asClassicSchema(schema.def.left, `${path}&0`),
        seen,
        `${path}&0`,
      ) ??
      openRootPath(
        asClassicSchema(schema.def.right, `${path}&1`),
        seen,
        `${path}&1`,
      )
    );
  }
  if (schema instanceof z.ZodObject || schema instanceof z.ZodTuple) {
    return undefined;
  }
  if (schema instanceof z.ZodPipe) {
    // The OUT side is what the response carries.
    return openRootPath(asClassicSchema(schema.def.out, path), seen, path);
  }
  if (schema instanceof z.ZodLazy) {
    return openRootPath(asClassicSchema(schema.unwrap(), path), seen, path);
  }
  const inner: unknown = Reflect.get(schema.def, 'innerType');
  return inner instanceof z.ZodType
    ? openRootPath(asClassicSchema(inner, path), seen, path)
    : undefined;
}

function isPassThroughNode(schema: z.ZodType): boolean {
  return (
    schema instanceof z.ZodTransform ||
    schema instanceof z.ZodAny ||
    schema instanceof z.ZodUnknown ||
    schema instanceof z.ZodCustom
  );
}

function findOpenObject(
  schema: z.ZodType,
  seen: Set<z.ZodType>,
  path: string,
): string | undefined {
  if (seen.has(schema)) return undefined;
  seen.add(schema);

  if (schema instanceof z.ZodObject) {
    const catchall = schema.def.catchall;
    if (catchall !== undefined && !(catchall instanceof z.ZodNever)) {
      return path;
    }
  }
  for (const [childPath, child] of schemaChildren(schema, path)) {
    const found = findOpenObject(
      asClassicSchema(child, childPath),
      seen,
      childPath,
    );
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Every schema a node can hold, with the path label of each — the one
 * walker every response-safety check shares. Structural
 * nodes are matched by class; everything that wraps ONE inner schema
 * (`optional`, `nullable`, `default`, `prefault`, `readonly`, `catch`,
 * `nonoptional`, `promise`, …) is read through the shared `innerType`
 * slot so a wrapper zod adds later is walked without a new case here.
 */
/**
 * An `out` side that hands (some of) its input through unchanged — a
 * transform, `any`, `unknown`, `custom`, or any composite that holds one
 * of those somewhere below it (wrappers, unions, arrays, object
 * properties, record values, intersections, nested pipes).
 */
// Only `true` is memoized (schemas are immutable and the predicate is
// monotone, so a `true` is always sound). A `false` decided while a
// cycle was still open is NOT an answer — it is what a node reads about
// itself mid-walk — so it is never cached; termination comes from the
// per-walk `inProgress` set that `schemaChildren` threads back in for
// the pipe branch. Caching that `false` made the verdict depend on visit
// order and failed OPEN (found in PR review).
const passesThroughTrue = new WeakSet<z.ZodType>();

function passesThrough(
  schema: z.ZodType,
  path: string,
  inProgress: Set<z.ZodType> = new Set(),
): boolean {
  if (passesThroughTrue.has(schema)) return true;
  if (inProgress.has(schema)) return false;
  inProgress.add(schema);
  const result =
    schema instanceof z.ZodTransform ||
    schema instanceof z.ZodAny ||
    schema instanceof z.ZodUnknown ||
    schema instanceof z.ZodCustom ||
    // Any composite with a pass-through somewhere below it hands SOME of
    // its input through (`z.object({ a: z.any() })`, `z.array(z.any())`,
    // a record of `any`, an intersection or nested pipe ending in one) —
    // the shared walker covers every node kind; over-flagging fails closed.
    schemaChildren(schema, path, inProgress).some(([childPath, child]) =>
      passesThrough(asClassicSchema(child, childPath), childPath, inProgress),
    );
  inProgress.delete(schema);
  if (result) passesThroughTrue.add(schema);
  return result;
}

export function schemaChildren(
  schema: z.ZodType,
  path: string,
  inProgress?: Set<z.ZodType>,
): Array<[string, z.core.$ZodType]> {
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).map(([key, field]) => [
      `${path}.${key}`,
      field,
    ]);
  }
  if (schema instanceof z.ZodArray) {
    return [[`${path}[]`, schema.element]];
  }
  if (schema instanceof z.ZodTuple) {
    const items: Array<[string, z.core.$ZodType]> = schema.def.items.map(
      (item, index) => [`${path}[${index}]`, item],
    );
    if (schema.def.rest !== null) {
      items.push([`${path}[...]`, schema.def.rest]);
    }
    return items;
  }
  if (schema instanceof z.ZodUnion) {
    return schema.options.map((option, index) => [`${path}|${index}`, option]);
  }
  if (schema instanceof z.ZodIntersection) {
    return [
      [`${path}&0`, schema.def.left],
      [`${path}&1`, schema.def.right],
    ];
  }
  if (
    schema instanceof z.ZodRecord ||
    schema instanceof z.ZodMap ||
    schema instanceof z.ZodSet
  ) {
    return [[`${path}[*]`, schema.def.valueType]];
  }
  if (schema instanceof z.ZodPipe) {
    // `z.preprocess` puts the object on `out`; an ordinary `.transform()`
    // puts it on `in` and its `out` is the transform node, which passes
    // whatever `in` let through — as do `z.any()`, `z.unknown()` and
    // `z.custom()`. A pipe whose `out` is a real schema
    // (`z.pipe(open, closed)`) strips on the way out, so `in` is only
    // walked when `out` passes values through.
    return passesThrough(
      asClassicSchema(schema.def.out, path),
      path,
      inProgress,
    )
      ? [
          [`${path}<in`, schema.def.in],
          [path, schema.def.out],
        ]
      : [[path, schema.def.out]];
  }
  if (schema instanceof z.ZodLazy) {
    return [[path, schema.unwrap()]];
  }
  const inner: unknown = Reflect.get(schema.def, 'innerType');
  if (inner instanceof z.ZodType) {
    return [[path, inner]];
  }
  return [];
}

/**
 * The paginated envelope for a named response schema, named after it
 * (`TagResponseDto` → `TagResponseDtoPaginatedDto`) and cached per
 * resource instance: one resource, one paginated component, however many
 * places ask for it. Two DIFFERENT instances claiming one id would fail
 * in the document converter, so the cache is load-bearing.
 */
const paginatedCache = new WeakMap<z.ZodType, z.ZodType>();

export function buildPaginatedSchema(
  resource: z.ZodType,
  context: string,
): z.ZodType {
  const cached = paginatedCache.get(resource);
  if (cached !== undefined) return cached;
  assertNamedSchema(resource, context);
  const built = withOpenApi(
    paginatedSchema(resource),
    `${readSchemaId(resource)}PaginatedDto`,
  );
  paginatedCache.set(resource, built);
  return built;
}
