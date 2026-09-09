import { createHash } from 'node:crypto';
import type { StandardSchemaConverter } from '@nestjs/swagger';
import { z } from 'zod';
import { readSchemaId } from '../utils/open-api-schema.util';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Document converter that turns every schema carrying an OpenAPI id
 * (`withOpenApi(schema, id)`) into a `$ref` to `components/schemas/<id>`,
 * so generated documents keep stable component names instead of inlining
 * the same shape into every route.
 *
 * One map per document: an id claimed by two DIFFERENT schema instances is
 * a boot error here rather than a silent last-wins overwrite. So is ONE
 * instance documented from both sides (`@Body({ schema })` and
 * `ApiResponse({ standardSchema })`): zod's input and output JSON Schemas
 * differ by construction (transforms, defaults become required,
 * `additionalProperties: false` on the output side), so one component
 * cannot describe a request and a response — the response gets its own
 * id. Nested named schemas arrive as `definitions` in the raw JSON Schema
 * and are lifted into `components` (Swagger rewrites `#/definitions/x`
 * refs).
 *
 * Deliberately not upstream's `withNamedComponent` registry: that one is
 * module-global and throws on the second registration of an id, which the
 * test suites (and any factory that compiles a resource more than once)
 * would trip over.
 */
interface ComponentClaim {
  readonly schema: z.ZodType;
  readonly side: 'input' | 'output';
}

/**
 * zod names a definition it had to extract but cannot name — the inner
 * object of a `z.lazy()` recursion is the common one — positionally, as
 * `__schema0`, `__schema1`, … The counter restarts for every schema
 * converted, so two unrelated recursive schemas in one document both ask
 * for `__schema0` and collide: before this rename the second one aborted
 * document generation with a shape-mismatch error that blamed the
 * request/response split instead of the name.
 *
 * Qualifying the name with the owning component id AND the definition's
 * own content (`<ownerId>Ref_<8 hex>`) keeps it unique across the
 * document, derived only from that schema, and out of the author
 * namespace by construction — a counter name (`TreeDtoRef0`) was
 * guessable, and an author schema carrying it made the outcome depend on
 * conversion order.
 */
const ANONYMOUS_DEFINITION = /^__schema\d+$/u;

/**
 * Reserved prefix for a component name this converter generates for a
 * definition `z.toJSONSchema` had to extract but could not name. Not an
 * author's namespace, and not derived from whichever component happened
 * to be converted first.
 */
const GENERATED_DEFINITION_PREFIX = 'RocketsRef_';

/**
 * `z.toJSONSchema` renders a discriminated union as a bare `oneOf`, losing
 * the one thing that makes it discriminated. A client generator reading
 * plain `oneOf` has to try each branch in turn instead of switching on the
 * tag, which is both slower and lossier than the tagged union the schema
 * describes.
 *
 * OpenAPI's `discriminator` only applies when every branch is a `$ref`, so
 * this is added exactly when the branches were named with `withOpenApi()`
 * and left inline otherwise. `mapping` is always written: without it the
 * spec's implicit mapping matches the tag value against the COMPONENT
 * name, and `'circle'` is not `'CircleDto'`.
 */
function readZodDef(schema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(schema)) return undefined;
  const inner = schema['_zod'];
  const def = isRecord(inner) ? inner['def'] : schema['def'];
  return isRecord(def) ? def : undefined;
}

function discriminatorFor(
  schema: unknown,
): Record<string, unknown> | undefined {
  const def = readZodDef(schema);
  const propertyName = def?.['discriminator'];
  const options = def?.['options'];
  if (typeof propertyName !== 'string' || !Array.isArray(options)) {
    return undefined;
  }

  const mapping: Record<string, string> = {};
  for (const option of options) {
    // Every branch must be a named component: `discriminator` is only
    // legal over `$ref` branches, and a partial mapping would document
    // some tags while silently dropping the rest.
    const branchId =
      option instanceof z.ZodType ? readSchemaId(option) : undefined;
    if (branchId === undefined) {
      return undefined;
    }
    const shape = readZodDef(option)?.['shape'];
    const values = isRecord(shape)
      ? readZodDef(shape[propertyName])?.['values']
      : undefined;
    if (!Array.isArray(values)) {
      return undefined;
    }
    for (const value of values) {
      if (typeof value !== 'string') {
        return undefined;
      }
      mapping[value] = `#/components/schemas/${branchId}`;
    }
  }

  return { mapping, propertyName };
}

/**
 * Collects `id -> discriminator` for every named discriminated union
 * reachable from one converted schema, including the ones that only ever
 * appear as lifted definitions. A nested named schema never re-enters this
 * converter, so the union's zod node — the only place the tag property and
 * its literal values exist — is unreachable by the time its JSON Schema is
 * being emitted. Walking from the root once is what keeps them connected.
 */
function collectDiscriminators(
  schema: unknown,
  into: Map<string, Record<string, unknown>>,
  seen: Set<unknown>,
): void {
  if (!isRecord(schema) || seen.has(schema)) {
    return;
  }
  seen.add(schema);

  if (schema instanceof z.ZodType) {
    const id = readSchemaId(schema);
    const discriminator = discriminatorFor(schema);
    if (id !== undefined && discriminator !== undefined) {
      into.set(id, discriminator);
    }
  }

  const def = readZodDef(schema);
  if (def === undefined) {
    return;
  }
  for (const value of Object.values(def)) {
    if (Array.isArray(value)) {
      for (const entry of value) collectDiscriminators(entry, into, seen);
    } else if (isRecord(value)) {
      // `shape` is a plain record of fields, not a zod node — recursing
      // into its values covers both it and single-child defs alike.
      collectDiscriminators(value, into, seen);
      for (const entry of Object.values(value)) {
        collectDiscriminators(entry, into, seen);
      }
    }
  }
}

/**
 * Stable stringification: object keys sorted at every depth.
 *
 * The digest below names a published component, so it must depend on the
 * SHAPE and nothing else. Plain `JSON.stringify` is key-insertion
 * ordered, so a zod release that emits the same JSON Schema with keys in
 * a different order would rename every generated component with no wire
 * change — churning generated clients for nothing.
 */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Content digest of every definition in one conversion, TRANSITIVE.
 *
 * The names zod gives extracted definitions (`__schema0`, `__schema1`)
 * are POSITIONAL and restart per conversion, and a lifted definition can
 * reference another one — a recursive node whose field is a second
 * recursive node emits `__schema0` holding `$ref: __schema1`. Hashing a
 * definition's own JSON alone therefore gives the SAME digest to two
 * definitions with the same outer shape and different children, and the
 * second conversion reuses the first one's name for a different
 * component: the document then aborts on the two-shapes check, which is
 * the failure this naming scheme exists to prevent. Each reference is
 * substituted with the digest of what it points at, so equal digests
 * mean equal meaning.
 *
 * A reference that points back INTO the definition being computed is a
 * cycle — the ordinary case, since these definitions exist because the
 * schema is recursive. It is substituted with its distance up the stack,
 * so two structurally identical cycles agree and two different ones do
 * not. A digest computed while a back-edge to an ANCESTOR was open is
 * relative to that ancestor rather than absolute, so it is not cached;
 * a self-reference is relative to the node itself and stays cacheable.
 */
function digestDefinitions(
  definitions: Record<string, unknown>,
): Map<string, string> {
  const absolute = new Map<string, string>();

  const walk = (
    name: string,
    path: readonly string[],
  ): { digest: string; open: boolean } => {
    const back = path.indexOf(name);
    if (back !== -1) {
      const distance = path.length - back;
      return { digest: `@up${distance}`, open: distance > 1 };
    }
    const cached = absolute.get(name);
    if (cached !== undefined) return { digest: cached, open: false };

    const next = [...path, name];
    let open = false;
    const substituted = substituteRefs(definitions[name], (target) => {
      if (!(target in definitions)) return undefined;
      const child = walk(target, next);
      if (child.open) open = true;
      return child.digest;
    });
    const digest = createHash('sha256')
      .update(canonicalJson(substituted))
      .digest('hex')
      .slice(0, 8);
    if (!open) absolute.set(name, digest);
    return { digest, open };
  };

  const digests = new Map<string, string>();
  for (const name of Object.keys(definitions)) {
    digests.set(name, walk(name, []).digest);
  }
  return digests;
}

/**
 * Deep copy with every `$ref` to a definition in this conversion replaced
 * by what `resolve` returns for it. A ref `resolve` does not recognise is
 * left alone, so a pointer out of the bundle still contributes its own
 * text to the digest.
 */
function substituteRefs(
  node: unknown,
  resolve: (target: string) => string | undefined,
): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => substituteRefs(entry, resolve));
  }
  if (!isRecord(node)) return node;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref' && typeof value === 'string') {
      const target = value.slice(value.lastIndexOf('/') + 1);
      const resolved = resolve(target);
      next[key] = resolved === undefined ? value : `@def:${resolved}`;
      continue;
    }
    next[key] = substituteRefs(value, resolve);
  }
  return next;
}

function qualifyAnonymousDefinitions(
  id: string,
  components: Record<string, unknown>,
  claimed: ReadonlySet<string>,
  generatedNames: Map<string, string>,
  namesByDigest: Map<string, string>,
): Record<string, unknown> {
  const renames = new Map<string, string>();
  // The qualified name is `RocketsRef_<8 hex of the definition's
  // TRANSITIVE content>` — a reserved prefix plus content, never a
  // counter and never the owner's id. A counter (`TreeDtoRef0`) made the name guessable and
  // an author schema carrying that id turned into an ORDER-DEPENDENT
  // clash. Qualifying with the OWNER's id fixed that but left a subtler
  // order dependence: the same lifted definition reached from two
  // components would be named after whichever route was converted first,
  // so ADDING a route renamed a published component and churned every
  // generated client — and a definition named after resource A turned up
  // inside resource B. Content alone is stable under both.
  //
  // `taken` still guards the residual cases — the other definitions
  // lifted from this same schema and every component already emitted —
  // so even a deliberate author collision with a hash degrades to a
  // suffixed rename inside one conversion, and to the precise
  // generated-name error across conversions.
  const taken = new Set<string>([...Object.keys(components), ...claimed]);
  const digests = digestDefinitions(components);
  for (const name of Object.keys(components)) {
    if (name !== id && ANONYMOUS_DEFINITION.test(name)) {
      const digest = digests.get(name) as string;
      // The SAME lifted definition reached through a second owner keeps
      // one name. A schema with a recursive (or `z.json()`) field
      // documented on two routes — a read and the paginated envelope of
      // its list, the ordinary case — otherwise had the OWNER's component
      // pointing at a different `$ref` per conversion, and the two-shapes
      // check below aborted the whole document. The name is content-only,
      // so this map is a fast path rather than the thing that makes the
      // name agree.
      //
      // Reuse is sound because the digest is TRANSITIVE (see
      // `digestDefinitions`): equal digests mean the definition and
      // everything it references are equal, so the two conversions emit
      // the same component under the same name. A definition is NOT
      // self-contained — one lifted definition can reference another —
      // which is exactly why hashing its own JSON alone was not enough.
      const reused = namesByDigest.get(digest);
      if (reused !== undefined) {
        renames.set(name, reused);
        continue;
      }
      const base = `${GENERATED_DEFINITION_PREFIX}${digest}`;
      let candidate = base;
      for (let attempt = 2; taken.has(candidate); attempt += 1) {
        candidate = `${base}_${attempt}`;
      }
      taken.add(candidate);
      renames.set(name, candidate);
      generatedNames.set(candidate, id);
      namesByDigest.set(digest, candidate);
    }
  }
  if (renames.size === 0) {
    return components;
  }

  const rewriteRefs = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(rewriteRefs);
    }
    if (!isRecord(node)) {
      return node;
    }
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        // The raw JSON Schema points at `#/$defs/x` or `#/definitions/x`;
        // Swagger rewrites those to `#/components/schemas/x` only after
        // this converter returns. Match every prefix and keep the one the
        // ref already used, so the rewrite is invisible downstream.
        const match =
          /^(#\/(?:\$defs|definitions|components\/schemas)\/)(.+)$/u.exec(
            value,
          );
        const renamed =
          match === undefined || match === null
            ? undefined
            : renames.get(match[2] as string);
        next[key] =
          renamed === undefined ? value : `${match?.[1] ?? ''}${renamed}`;
        continue;
      }
      next[key] = rewriteRefs(value);
    }
    return next;
  };

  const qualified: Record<string, unknown> = {};
  for (const [name, json] of Object.entries(components)) {
    qualified[renames.get(name) ?? name] = rewriteRefs(json);
  }
  return qualified;
}

export function createRocketsStandardSchemaConverter(): StandardSchemaConverter {
  const claims = new Map<string, ComponentClaim>();
  const emitted = new Map<string, string>();
  /** Generated component name mapped to the id it was lifted from. */
  const generatedNames = new Map<string, string>();
  /**
   * Digest of a lifted definition's own JSON mapped to the name this
   * document already gave it — how the same definition keeps one name
   * across every owner that embeds it.
   */
  const namesByDigest = new Map<string, string>();

  return (schema, { schemaType }) => {
    if (!(schema instanceof z.ZodType)) return undefined;
    const id = readSchemaId(schema);
    if (id === undefined) return undefined;

    // An author id landing on a name this document already GENERATED for
    // a recursive definition is unresolvable: the generated component and
    // its `$ref`s are in Swagger's hands, and the author's id is a wire
    // contract that cannot be renamed on their behalf. Without this check
    // the clash surfaced as the request/response two-shapes error below —
    // true words, wrong diagnosis.
    const generatedOwner = generatedNames.get(id);
    if (generatedOwner !== undefined) {
      throw new Error(
        `OpenAPI component "${id}" collides with a name this document ` +
          `generated for a recursive definition lifted from ` +
          `"${generatedOwner}". Generated names are ` +
          `${GENERATED_DEFINITION_PREFIX}<hash>; give this schema a ` +
          `different withOpenApi() id — or name the recursive node itself ` +
          `with withOpenApi(), which stops a name being generated for it ` +
          `at all.`,
      );
    }

    const prior = claims.get(id);
    if (prior !== undefined && prior.schema !== schema) {
      throw new Error(
        `OpenAPI component "${id}" is claimed by two different schema ` +
          `instances in the same document. Reuse one instance, or give the ` +
          `second schema its own id.`,
      );
    }
    if (prior !== undefined && prior.side !== schemaType) {
      throw new Error(
        `OpenAPI component "${id}" is documented as both a request ` +
          `(input) and a response (output). A schema's input and output ` +
          `JSON Schemas differ, so one component cannot describe both — ` +
          `give the response side its own withOpenApi() id.`,
      );
    }
    claims.set(id, { schema, side: schemaType });

    const jsonSchema: unknown = Reflect.get(schema['~standard'], 'jsonSchema');
    const convert: unknown = isRecord(jsonSchema)
      ? jsonSchema[schemaType]
      : undefined;
    if (typeof convert !== 'function') {
      throw new Error(
        `OpenAPI component "${id}" has no JSON Schema bridge — wrap the ` +
          `schema LAST with withOpenApi().`,
      );
    }
    const raw: unknown = convert({ target: 'openapi-3.0' });
    if (!isRecord(raw)) return undefined;

    const { $defs, definitions, ...own } = raw;
    const components = qualifyAnonymousDefinitions(
      id,
      {
        ...(isRecord($defs) ? $defs : {}),
        ...(isRecord(definitions) ? definitions : {}),
        [id]: own,
      },
      new Set(emitted.keys()),
      generatedNames,
      namesByDigest,
    );

    // Matched by BRANCH SET, not by component name. The same union node is
    // reached under one id here and emitted under another as a lifted
    // definition (an operation's generated wrapper id over an authored
    // response id is the ordinary case), so keying on the id this call saw
    // attaches the discriminator to a component that does not exist.
    const discriminators = new Map<string, Record<string, unknown>>();
    collectDiscriminators(schema, discriminators, new Set());
    for (const discriminator of discriminators.values()) {
      const branches = Object.values(
        discriminator['mapping'] as Record<string, string>,
      );
      for (const [name, json] of Object.entries(components)) {
        if (!isRecord(json) || !Array.isArray(json['oneOf'])) continue;
        const refs = json['oneOf'].map((branch) =>
          isRecord(branch) && typeof branch['$ref'] === 'string'
            ? branch['$ref'].slice(branch['$ref'].lastIndexOf('/') + 1)
            : undefined,
        );
        const named = new Set(
          branches.map((r) => r.slice(r.lastIndexOf('/') + 1)),
        );
        if (
          refs.length === named.size &&
          refs.every((r) => r !== undefined && named.has(r))
        ) {
          components[name] = { ...json, discriminator };
        }
      }
    }
    // Nested named schemas never re-enter this converter — they arrive
    // as definitions of whichever schema embeds them. The same nested id
    // reached from a request and from a response carries two different
    // JSON Schemas (see above), and Swagger would keep whichever came
    // last. Compare every emitted component against what the document
    // already holds under that name.
    for (const [name, json] of Object.entries(components)) {
      const serialized = JSON.stringify(json);
      const previous = emitted.get(name);
      if (previous !== undefined && previous !== serialized) {
        throw new Error(
          `OpenAPI component "${name}" is emitted with two different shapes ` +
            `in the same document (reached through "${id}" as ${schemaType}). ` +
            `A nested named schema used on both the request and the ` +
            `response side needs one id per side.`,
        );
      }
      emitted.set(name, serialized);
    }
    return {
      schema: { $ref: `#/components/schemas/${id}` },
      components,
    };
  };
}
