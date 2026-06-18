import type { PlainLiteralObject, Type } from '@nestjs/common';
import {
  Exclude,
  Expose,
  Transform,
  Type as TransformType,
} from 'class-transformer';
import type { ClassTransformOptions } from 'class-transformer';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import {
  defineResource,
  defineSubResource,
  OwnerStampHook,
} from '@bitwild/rockets-core';
import type {
  CrudResource,
  ResourceDeleteOperationConfig,
  ResourceOperationConfig,
  ResourceOperationsObject,
  ResourceRelationEntry,
  ResourceRestoreOperationConfig,
  RocketsResourceDefinition,
  RocketsSubResourceDefinition,
  RocketsSubResourceInput,
  RocketsUserMetadataConfig,
  SchemaEntityCompiler,
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';
import {
  getRegisteredEntity,
  registerSchemaEntity,
  resolveRelationTarget,
} from './schema-registry';
import {
  isDbGenerated,
  relationPropertyFor,
  unwrapField,
  RocketsRelationTarget,
} from './field-meta';

export type ZodCrudOperation =
  | 'list'
  | 'read'
  | 'create'
  | 'update'
  | 'replace'
  | 'delete'
  | 'restore';

/**
 * Per-operation config accepted by the zod layer: everything
 * `defineResource` accepts for the operation EXCEPT `input` / `output`,
 * which are owned by the schema compilation. `true` enables the
 * operation with defaults; `false` / omitted disables it.
 */
export type ZodOperationConfig = Omit<
  ResourceOperationConfig,
  'input' | 'output'
>;
export type ZodDeleteOperationConfig = Omit<
  ResourceDeleteOperationConfig,
  'input' | 'output'
>;
export type ZodRestoreOperationConfig = Omit<
  ResourceRestoreOperationConfig,
  'input' | 'output'
>;

export interface ZodResourceOperations {
  readonly list?: boolean | ZodOperationConfig;
  readonly read?: boolean | ZodOperationConfig;
  readonly create?: boolean | ZodOperationConfig;
  readonly update?: boolean | ZodOperationConfig;
  readonly replace?: boolean | ZodOperationConfig;
  readonly delete?: boolean | ZodDeleteOperationConfig;
  readonly restore?: boolean | ZodRestoreOperationConfig;
}

/**
 * Declarative resource definition with a zod schema as the single
 * source of truth: DTOs AND the entity class are compiled from it.
 *
 * Extends the full `defineResource` surface — hooks, handlers,
 * providers, decorators, request, public, subResources, relations,
 * repository, key/path/tags all pass through untouched. Only `entity`,
 * `dto` and the per-operation `input`/`output` are owned by the schema
 * compilation.
 *
 * Static typing comes from the schema (`z.infer`), so the resource is
 * deliberately non-generic — consumers type rows with the inferred
 * schema type, never with the (generated) entity class.
 */
export interface ZodResourceDefinition
  extends Omit<
    RocketsResourceDefinition<PlainLiteralObject>,
    'entity' | 'dto' | 'operations'
  > {
  /** PascalCase base for generated class names (`Tag` → `TagCreateDto`, `TagEntity`). */
  readonly name: string;
  /**
   * Source of truth. Field roles come from the `rocketsFieldMeta`
   * registry: `db` drives the generated entity's columns and the
   * default create/update exclusion of generated fields; `dto` opts a
   * field in/out of each projection explicitly; `relation` declares a
   * cross-resource FK referencing another zod schema (or entity class).
   * API extras (`example`, `description`) use native `.meta()` and flow
   * into OpenAPI via zod's own JSON Schema output.
   */
  readonly schema: z.ZodObject;
  /**
   * Entity class override (escape hatch). When omitted, the entity is
   * GENERATED from the schema via the active {@link SchemaEntityCompiler}
   * — named `${name}Entity`, mapped to `table`.
   */
  readonly entity?: Type<PlainLiteralObject>;
  /** Physical table name for the generated entity. Default: lowercased `name` + 's'. */
  readonly table?: string;
  /**
   * Adapter that compiles the schema into the persistence entity class.
   * Usually supplied once via {@link bindZodResources}; an explicit
   * value here (or a `repository.entityCompiler`) overrides that bound
   * default for this one resource. Ignored when `entity` is provided.
   */
  readonly entityCompiler?: SchemaEntityCompiler;
  /**
   * Operations to expose. Array of names (defaults applied per op) or a
   * keyed object carrying the full per-op `defineResource` config minus
   * `input`/`output`. Defaults to list/read/create/update/delete —
   * the same default set as `defineResource`.
   */
  readonly operations?: readonly ZodCrudOperation[] | ZodResourceOperations;
  /**
   * Owner column name. The layer excludes it from create/update DTOs and
   * stamps it from the authenticated actor (`OwnerStampHook`). Equivalent
   * to marking the field `{ owner: true }` — pick whichever reads better
   * (the string is the more common, sub-resource-`owner`-like spelling).
   * Combined with any `{ owner: true }` flags if both are used.
   */
  readonly owner?: string;
  /**
   * Owner-stamp auto-wiring. Owner columns come from {@link owner} and/or
   * `{ owner: true }` field flags; the layer prepends an `OwnerStampHook`
   * for each. Set `false` to opt out (e.g. an admin resource over the
   * same schema, or to supply a custom stamping hook by hand in `hooks`).
   * Default `true`.
   */
  readonly ownerStamp?: boolean;
}

export interface ZodResourceDtos {
  readonly response: Type<object>;
  readonly create?: Type<object>;
  readonly update?: Type<object>;
  readonly replace?: Type<object>;
}

/**
 * Preserved compilation inputs/outputs. This is the embryo of the
 * frontend resource manifest (schema + operations + dtos) — the dynamic
 * screen generation phase consumes it; the server ignores it.
 */
export interface ZodResourceManifest {
  readonly definition: ZodResourceDefinition | ZodSubResourceDefinition;
  readonly dtos: ZodResourceDtos;
  /** The entity class in use — generated from the schema unless overridden. */
  readonly entity: Type<PlainLiteralObject>;
}

const DEFAULT_OPERATIONS: ZodResourceOperations = {
  list: true,
  read: true,
  create: true,
  update: true,
  delete: true,
};

/**
 * DTO classes come straight from `nestjs-zod`'s `createZodDto` — no
 * custom decorator compilation:
 * - Swagger reads the static `_OPENAPI_METADATA_FACTORY` (zod v4's own
 *   `z.toJSONSchema`), the same hook the `@nestjs/swagger` CLI plugin
 *   targets. Apply `cleanupOpenApiDoc` to the built document.
 * - rockets-crud detects the static `schema` (Standard Schema) and
 *   validates bodies with the source zod schema — including rules
 *   class-validator cannot express (`.refine()`, coercions).
 * - Responses flow through the SAME class-transformer interceptor as
 *   handwritten resources, so the class carries the project DTO idiom
 *   (class-level `@Exclude` + per-field `@Expose`, `@Type` for nested
 *   relation projections) — that is what strips write-only fields from
 *   responses with full defineResource parity.
 * Only the class NAME is set here, so Swagger components match the
 * handwritten naming convention.
 */
function compileDtoClass(
  schema: z.ZodObject,
  name: string,
  nested?: Readonly<Record<string, Type<object>>>,
): Type<object> {
  const cls = createZodDto(schema);
  Object.defineProperty(cls, 'name', { value: name });
  Exclude()(cls);
  const proto: object = cls.prototype;
  for (const [key, field] of Object.entries(schema.shape)) {
    Expose()(proto, key);
    const nestedClass = nested?.[key];
    if (nestedClass !== undefined) {
      TransformType(() => nestedClass)(proto, key);
      continue;
    }
    const { base, meta } = unwrapField(field, `${name}.${key}`);
    // Computed response field: derive the value from the raw row on the
    // way in; the instance then carries the plain result out untouched.
    const compute = meta.compute;
    if (compute !== undefined) {
      Transform(({ obj }: { obj: Record<string, unknown> }) => compute(obj), {
        toClassOnly: true,
      })(proto, key);
      continue;
    }
    // Free-form object values (json columns: z.record / plain z.object
    // / z.unknown) have no transformer metadata — the `excludeAll`
    // serialization strategy would empty them. Passthrough transforms
    // re-read the RAW value from the source object (`value` already
    // arrives recursively stripped) so it crosses both directions
    // untouched.
    if (
      base instanceof z.ZodRecord ||
      base instanceof z.ZodObject ||
      base instanceof z.ZodUnknown ||
      base instanceof z.ZodAny
    ) {
      const raw = ({ obj }: { obj: Record<string, unknown> }): unknown =>
        obj?.[key];
      Transform(raw, { toClassOnly: true })(proto, key);
      Transform(raw, { toPlainOnly: true })(proto, key);
    }
  }
  return cls;
}

interface SchemaProjections {
  readonly create: Record<string, z.ZodType>;
  readonly update: Record<string, z.ZodType>;
  readonly response: Record<string, z.ZodType>;
  /** Nested object schema per exposed relation property on the response. */
  readonly responseNested: Record<string, z.ZodObject>;
  readonly pkKey: string | undefined;
  readonly relations: ReadonlyArray<ResourceRelationEntry<PlainLiteralObject>>;
}

/**
 * Split the schema into the three DTO projections.
 *
 * Defaults per field: `response` always in; `create`/`update` in unless
 * the field is db-generated. Explicit `dto` roles win over the derived
 * default. The pk is special-cased into `update` as optional (the id
 * arrives via the URL param) unless `dto.update === false`.
 *
 * Relations:
 * - FK side (`manyToOne`/`oneToOne`): the FK field follows the normal
 *   role rules; `expose` additionally projects the target schema's OWN
 *   response projection as a nested optional object under the relation
 *   property.
 * - `hasMany`: never a column, never writable — skipped from all role
 *   projections; `expose` projects an array of the child's response
 *   projection under the field key.
 * Nested projections are one level deep (nested exposes are not
 * followed; relation graphs are circular by nature).
 */
function projectSchema(
  resourceName: string,
  schema: z.ZodObject,
  entity: Type<PlainLiteralObject>,
  ownerColumns: ReadonlySet<string>,
): SchemaProjections {
  const create: Record<string, z.ZodType> = {};
  const update: Record<string, z.ZodType> = {};
  const response: Record<string, z.ZodType> = {};
  const responseNested: Record<string, z.ZodObject> = {};
  const relations: ResourceRelationEntry<PlainLiteralObject>[] = [];
  let pkKey: string | undefined;

  for (const [key, field] of Object.entries(schema.shape)) {
    const path = `${resourceName}.${key}`;
    const { meta } = unwrapField(field, path);
    const relation = meta.relation;

    if (meta.compute !== undefined) {
      // Computed: response-only, documented by the field's own zod type.
      response[key] = field;
      continue;
    }

    if (relation?.kind === 'hasMany') {
      if (relation.expose === true) {
        const nested = exposedResponseSchema(
          relation.shape ?? relation.target,
          path,
        );
        responseNested[key] = nested;
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

    // Owner columns are server-stamped from the actor — never accepted
    // on create/update, always present in the response.
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
    if (meta.dto?.response ?? true) {
      response[key] = field;
    }

    if (relation !== undefined) {
      const property = relationPropertyFor(key, relation, path);
      if (relation.expose === true) {
        const nested = exposedResponseSchema(
          relation.shape ?? relation.target,
          path,
        );
        responseNested[property] = nested;
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

  return { create, update, response, responseNested, pkKey, relations };
}

/**
 * Nested response schema for an exposed relation: the target schema's
 * response projection (generated fields included, `dto.response: false`
 * respected, nested exposes NOT followed). The caller marks the field
 * optional — the relation may be absent on create responses.
 */
function exposedResponseSchema(
  target: RocketsRelationTarget,
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
    if (meta.dto?.response ?? true) {
      shape[key] = field;
    }
  }
  return z.object(shape);
}

function normalizeOperations(
  operations: readonly ZodCrudOperation[] | ZodResourceOperations | undefined,
): ZodResourceOperations {
  if (operations === undefined) {
    return DEFAULT_OPERATIONS;
  }
  if (Array.isArray(operations)) {
    return Object.fromEntries(
      (operations as readonly ZodCrudOperation[]).map((op) => [op, true]),
    );
  }
  return operations as ZodResourceOperations;
}

function opConfig<T extends object>(
  value: boolean | T | undefined,
): T | Record<string, never> {
  return typeof value === 'object' ? value : {};
}

/**
 * Outbound serialization for zod DTO responses. The module default pair
 * (`strategy: 'excludeAll'` + `excludeExtraneousValues`) makes
 * class-transformer SKIP custom `@Transform`s on `classToPlain` and
 * recursively empty free-form objects (json columns). Whitelisting
 * already happened on the way IN (`toInstance` keeps the excludeAll
 * defaults); the way out only needs prefix hygiene.
 */
const ZOD_TO_PLAIN_OPTIONS: ClassTransformOptions = {
  // Explicit neutralization — the serialize interceptor merges these
  // PER KEY over the module defaults, so omitting them would keep
  // excludeAll/excludeExtraneousValues alive.
  strategy: 'exposeAll',
  excludeExtraneousValues: false,
  excludePrefixes: ['_', '__'],
};

/**
 * Per-operation config with the zod outbound serialization installed,
 * preserving any consumer-provided `responseOverride` keys (theirs win).
 */
function zodOpConfig<T extends ZodOperationConfig>(
  value: boolean | T | undefined,
): ResourceOperationConfig {
  const config: T | Record<string, never> = opConfig(value);
  return {
    ...config,
    responseOverride: {
      ...config.responseOverride,
      serialization: {
        toPlainOptions: ZOD_TO_PLAIN_OPTIONS,
        ...config.responseOverride?.serialization,
      },
    },
  };
}

function pascal(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function hasDeletedAtField(schema: z.ZodObject): boolean {
  return Object.entries(schema.shape).some(
    ([key, field]) => unwrapField(field, key).meta.db?.deletedAt === true,
  );
}

/**
 * The owner column(s) of a schema: every field marked `{ owner: true }`,
 * plus the resource-level `owner: 'fieldName'` (top-level resources only)
 * when given. The string form must name a persisted string/uuid field —
 * a boot-time error otherwise, so a typo or a relation/computed target is
 * caught immediately rather than failing later at hook binding.
 */
function resolveOwnerColumns(
  schema: z.ZodObject,
  resourceName: string,
  owner: string | undefined,
): string[] {
  const columns = Object.entries(schema.shape)
    .filter(([key, field]) => unwrapField(field, key).meta.owner === true)
    .map(([key]) => key);

  if (owner !== undefined && !columns.includes(owner)) {
    const field = schema.shape[owner];
    if (field === undefined) {
      throw new Error(
        `[zodResource] "${resourceName}" sets owner: '${owner}' but the ` +
          'schema has no such field — declare it (e.g. `owner: z.uuid()`).',
      );
    }
    const { base, meta } = unwrapField(field, `${resourceName}.${owner}`);
    if (
      meta.compute !== undefined ||
      meta.relation !== undefined ||
      !(base instanceof z.ZodString || base instanceof z.ZodUUID)
    ) {
      throw new Error(
        `[zodResource] "${resourceName}" owner: '${owner}' must be a ` +
          'persisted string/uuid column (not a relation, computed or ' +
          'non-string field).',
      );
    }
    columns.push(owner);
  }
  return columns;
}

/**
 * Prepend the auto-wired `OwnerStampHook`(s) for the resolved owner
 * columns to the consumer's hooks. Stamping runs FIRST so the owner
 * column is set before downstream owner-scope / validation hooks.
 * `ownerStamp: false` opts out entirely (wire a custom hook by hand).
 */
function applyOwnerStamp(
  entity: Type<PlainLiteralObject>,
  ownerColumns: readonly string[],
  userHooks: RocketsResourceDefinition<PlainLiteralObject>['hooks'],
  ownerStamp: boolean | undefined,
): RocketsResourceDefinition<PlainLiteralObject>['hooks'] {
  if (ownerStamp === false || ownerColumns.length === 0) {
    return userHooks;
  }
  const stampHooks = ownerColumns.map((column) =>
    OwnerStampHook.for(entity, column),
  );
  return [...stampHooks, ...(userHooks ?? [])];
}

/**
 * Merge relation entries derived from field meta with whatever the
 * consumer passed in the `relations` field (builder or array form).
 */
function mergeRelations(
  user: RocketsResourceDefinition<PlainLiteralObject>['relations'],
  extra: ReadonlyArray<ResourceRelationEntry<PlainLiteralObject>>,
): RocketsResourceDefinition<PlainLiteralObject>['relations'] {
  if (extra.length === 0) {
    return user;
  }
  if (user === undefined) {
    return extra;
  }
  if (typeof user === 'function') {
    return (relation) => [...user(relation), ...extra];
  }
  return [...user, ...extra];
}

interface ZodCoreInput {
  readonly name: string;
  readonly schema: z.ZodObject;
  readonly entity?: Type<PlainLiteralObject>;
  readonly table?: string;
  readonly operations?: readonly ZodCrudOperation[] | ZodResourceOperations;
  /**
   * Resource-level owner column name (top-level resources only). Combined
   * with any `{ owner: true }` field flags; the resolved set is excluded
   * from create/update DTOs and stamped via `OwnerStampHook`.
   */
  readonly owner?: string;
  /**
   * App-level compiler for THIS resource — the bound default from
   * {@link bindZodResources}, or an explicit per-resource value. Used
   * unless the resource's `repository.entityCompiler` overrides it.
   */
  readonly entityCompiler?: SchemaEntityCompiler;
  /**
   * Per-resource adapter (the definition's `repository` passthrough).
   * When it carries an `entityCompiler`, that compiler wins over the
   * app default — entity generation is adapter-owned.
   */
  readonly repository?: RocketsResourceDefinition<PlainLiteralObject>['repository'];
}

interface CompiledZodCore {
  readonly entity: Type<PlainLiteralObject>;
  readonly operations: ResourceOperationsObject;
  readonly relations: ReadonlyArray<ResourceRelationEntry<PlainLiteralObject>>;
  readonly dtos: ZodResourceDtos;
  /** Resolved owner columns (field flags + resource-level `owner`). */
  readonly ownerColumns: string[];
}

/**
 * Shared compilation pipeline for `zodResource` and `zodSubResource`:
 * schema → entity (unless overridden) + DTO projections + per-operation
 * config + meta-derived relation entries.
 */
function compileZodCore(input: ZodCoreInput): CompiledZodCore {
  const { name, schema, table, entity: entityOverride } = input;

  // Entity resolution, in order:
  //   1. explicit `entity` override (escape hatch / classic class),
  //   2. an entity already compiled for THIS schema and registered
  //      (a schema file that compiled it eagerly to break a module
  //      cycle) — reuse it so the resource need not repeat `entity:`,
  //   3. compile it now via the adapter-owned compiler.
  // Precedence for (3): the per-resource adapter compiler
  // (`repository.entityCompiler`) wins — a multi-store app can put one
  // resource on a different backend — then the bound/explicit app
  // default. The zod layer never hardwires a persistence representation.
  let entity: Type<PlainLiteralObject>;
  if (entityOverride !== undefined) {
    entity = entityOverride;
  } else {
    const registered = getRegisteredEntity(schema);
    if (registered !== undefined) {
      entity = registered;
    } else {
      const compiler = input.repository?.entityCompiler ?? input.entityCompiler;
      if (compiler === undefined) {
        throw new Error(
          `[zodResource] "${name}" has no entity compiler. Bind one once via ` +
            'bindZodResources(compiler), or pass `entityCompiler` (or ' +
            '`repository.entityCompiler`) on the resource definition.',
        );
      }
      entity = compiler.compileEntity(schema, {
        name: `${name}Entity`,
        table: table ?? `${name.toLowerCase()}s`,
      });
    }
  }
  registerSchemaEntity(schema, entity);

  const ops = normalizeOperations(input.operations);
  const enabled = (op: ZodCrudOperation): boolean =>
    ops[op] !== undefined && ops[op] !== false;

  const ownerColumns = resolveOwnerColumns(schema, name, input.owner);
  const projections = projectSchema(
    name,
    schema,
    entity,
    new Set(ownerColumns),
  );

  if (
    (enabled('create') || enabled('replace')) &&
    Object.keys(projections.create).length === 0
  ) {
    throw new Error(
      `[zodResource] "${name}" enables create/replace but every field is ` +
        'excluded from the create projection (db-generated or ' +
        'dto.create: false) — nothing would be writable.',
    );
  }
  if (
    (enabled('update') || enabled('replace')) &&
    projections.pkKey === undefined
  ) {
    throw new Error(
      `[zodResource] "${name}" enables update/replace but no field is ` +
        'marked { db: { pk: true } }.',
    );
  }
  const deleteConfig = opConfig(ops.delete);
  if (
    'soft' in deleteConfig &&
    deleteConfig.soft === true &&
    entityOverride === undefined &&
    !hasDeletedAtField(schema)
  ) {
    throw new Error(
      `[zodResource] "${name}" enables delete: { soft: true } but no field ` +
        'is marked { db: { deletedAt: true } } — the generated entity would ' +
        'have no delete-date column and soft removal would fail at runtime.',
    );
  }

  // Nested classes exist only for class-transformer (`@Type`) so the
  // serialize interceptor projects eager-loaded relations exactly like
  // a handwritten nested DTO; Swagger inlines the shape from the parent
  // schema and never references these names.
  const responseNested = Object.fromEntries(
    Object.entries(projections.responseNested).map(([property, shape]) => [
      property,
      compileDtoClass(shape, `${name}${pascal(property)}ResponseDto`),
    ]),
  );
  const response = compileDtoClass(
    z.object(projections.response),
    `${name}ResponseDto`,
    responseNested,
  );
  const create = enabled('create')
    ? compileDtoClass(z.object(projections.create), `${name}CreateDto`)
    : undefined;
  const update = enabled('update')
    ? compileDtoClass(z.object(projections.update), `${name}UpdateDto`)
    : undefined;
  const replace = enabled('replace')
    ? compileDtoClass(z.object(projections.create), `${name}ReplaceDto`)
    : undefined;

  const operations: ResourceOperationsObject = {
    ...(enabled('list')
      ? { list: { ...zodOpConfig(ops.list), output: response } }
      : {}),
    ...(enabled('read')
      ? { read: { ...zodOpConfig(ops.read), output: response } }
      : {}),
    ...(enabled('create') && create !== undefined
      ? {
          create: {
            ...zodOpConfig(ops.create),
            input: create,
            output: response,
          },
        }
      : {}),
    ...(enabled('update') && update !== undefined
      ? {
          update: {
            ...zodOpConfig(ops.update),
            input: update,
            output: response,
          },
        }
      : {}),
    ...(enabled('replace') && replace !== undefined
      ? {
          replace: {
            ...zodOpConfig(ops.replace),
            input: replace,
            output: response,
          },
        }
      : {}),
    ...(enabled('delete') ? { delete: zodOpConfig(ops.delete) } : {}),
    ...(enabled('restore') ? { restore: zodOpConfig(ops.restore) } : {}),
  };

  return {
    entity,
    operations,
    relations: projections.relations,
    dtos: { response, create, update, replace },
    ownerColumns,
  };
}

/**
 * Compiles the schema into nestjs-zod DTO classes and delegates to
 * `defineResource()`. This function only translates — every resource
 * behavior (routing, swagger tags, handler wiring, hooks, guards)
 * remains owned by core. If translation ever requires copying core
 * logic, that is a missing core hook, not a problem to work around
 * here.
 */
export function zodResource(
  definition: ZodResourceDefinition,
): CrudResource<PlainLiteralObject> & { readonly zod: ZodResourceManifest } {
  const {
    name,
    schema,
    operations,
    table,
    entity: entityOverride,
    entityCompiler,
    owner,
    ownerStamp,
    ...passthrough
  } = definition;

  const core = compileZodCore({
    name,
    schema,
    table,
    entity: entityOverride,
    entityCompiler,
    operations,
    owner,
    repository: passthrough.repository,
  });

  const resource = defineResource<PlainLiteralObject>({
    ...passthrough,
    entity: core.entity,
    operations: core.operations,
    relations: mergeRelations(passthrough.relations, core.relations),
    hooks: applyOwnerStamp(
      core.entity,
      core.ownerColumns,
      passthrough.hooks,
      ownerStamp,
    ),
  });

  return Object.assign(resource, {
    zod: {
      definition,
      dtos: core.dtos,
      entity: core.entity,
    },
  });
}

/**
 * Sub-resource definition with a zod schema as the source of truth —
 * the schema-driven counterpart of `defineSubResource`. The sub bits
 * (`parentKey`, `parentPk`, `segment`, `owner`, `scope`,
 * `reloadAfterCreate`) and everything else `defineSubResource` accepts
 * pass straight through; entity, DTOs and per-operation input/output
 * are compiled exactly like `zodResource`.
 */
export interface ZodSubResourceDefinition
  extends Omit<
    RocketsSubResourceInput<PlainLiteralObject>,
    'entity' | 'dto' | 'operations'
  > {
  readonly name: string;
  readonly schema: z.ZodObject;
  readonly entity?: Type<PlainLiteralObject>;
  readonly table?: string;
  readonly entityCompiler?: SchemaEntityCompiler;
  readonly operations?: readonly ZodCrudOperation[] | ZodResourceOperations;
  /** See {@link ZodResourceDefinition.ownerStamp}. Default `true`. */
  readonly ownerStamp?: boolean;
}

export function zodSubResource(
  definition: ZodSubResourceDefinition,
): RocketsSubResourceDefinition & { readonly zod: ZodResourceManifest } {
  const {
    name,
    schema,
    operations,
    table,
    entity: entityOverride,
    entityCompiler,
    ownerStamp,
    ...passthrough
  } = definition;

  const core = compileZodCore({
    name,
    schema,
    table,
    entity: entityOverride,
    entityCompiler,
    operations,
    repository: passthrough.repository,
  });

  // No resource-level `owner` here: on a sub-resource `owner` is the
  // PARENT-ownership column (consumed by defineSubResource's path-scope
  // guard) — a different concept. Owner-STAMP on the sub's own entity is
  // declared with the `{ owner: true }` field flag instead.
  const sub = defineSubResource({
    ...passthrough,
    entity: core.entity,
    operations: core.operations,
    relations: mergeRelations(passthrough.relations, core.relations),
    hooks: applyOwnerStamp(
      core.entity,
      core.ownerColumns,
      passthrough.hooks,
      ownerStamp,
    ),
  });

  return Object.assign(sub, {
    zod: {
      definition,
      dtos: core.dtos,
      entity: core.entity,
    },
  });
}

/**
 * Bound `zodResource` / `zodSubResource` pair carrying a default
 * {@link SchemaEntityCompiler}. The compiler is the ONE app-level
 * persistence choice — picked once, here, and threaded into every
 * resource so schema files never repeat it.
 *
 * Resolution per resource: an explicit `entityCompiler` /
 * `repository.entityCompiler` on the definition still wins (multi-store
 * apps), so `bound.zodResource` is a default, not a lock-in.
 *
 * ```ts
 * import { bindZodResources } from '@bitwild/rockets-zod';
 * import { typeOrmZodEntityCompiler } from '@bitwild/rockets-zod-typeorm';
 *
 * export const zodEntityCompiler = typeOrmZodEntityCompiler;
 * export const { zodResource, zodSubResource } =
 *   bindZodResources(zodEntityCompiler);
 * ```
 */
export function bindZodResources(defaultCompiler: SchemaEntityCompiler): {
  zodResource: typeof zodResource;
  zodSubResource: typeof zodSubResource;
  defineUserMetadata: (
    schema: Parameters<typeof defineZodUserMetadata>[0],
    options?: Omit<ZodUserMetadataOptions, 'entityCompiler'>,
  ) => RocketsUserMetadataConfig;
} {
  return {
    zodResource: (definition) =>
      zodResource({
        ...definition,
        entityCompiler: definition.entityCompiler ?? defaultCompiler,
      }),
    zodSubResource: (definition) =>
      zodSubResource({
        ...definition,
        entityCompiler: definition.entityCompiler ?? defaultCompiler,
      }),
    defineUserMetadata: (schema, options) =>
      defineZodUserMetadata(schema, {
        ...options,
        entityCompiler: defaultCompiler,
      }),
  };
}

/**
 * Persistence fields every userMetadata schema must declare — the zod
 * mirror of `BaseUserMetadataEntityInterface`. Presence is checked at
 * boot ({@link assertUserMetadataShape}); the create / update DTO
 * projections omit the server-managed subset of these.
 */
const USER_METADATA_BASE_FIELDS = [
  'id',
  'userId',
  'dateCreated',
  'dateUpdated',
  'dateDeleted',
  'version',
] as const;

export interface ZodUserMetadataOptions {
  /** PascalCase base for generated class names. Default `'UserMetadata'`. */
  readonly name?: string;
  /** Physical table name. Default `'userMetadata'`. */
  readonly table?: string;
  /** Compiler for the entity class (usually the bound app default). */
  readonly entityCompiler?: SchemaEntityCompiler;
  /** Per-table adapter override forwarded to the userMetadata config. */
  readonly repository?: RocketsUserMetadataConfig['repository'];
}

/**
 * Build a named nestjs-zod DTO class typed as the contract `T` it
 * fulfils at runtime. zod cannot statically carry the field types of a
 * runtime-projected schema through `.omit()` / `.partial()` (the output
 * collapses to `Record<string, unknown>`), so the static contract is
 * asserted here — GUARANTEED at runtime by {@link assertUserMetadataShape}
 * (the required `userId` / `id` fields provably survive the projection).
 * Same dynamic-class boundary as `AppContextHost.with`.
 */
function namedZodDto<T>(schema: z.ZodObject, name: string): Type<T> {
  const cls = createZodDto(schema);
  Object.defineProperty(cls, 'name', { value: name });
  return cls as unknown as Type<T>;
}

/**
 * Boot-time guard: every userMetadata schema must declare the base
 * persistence fields. Throws a descriptive error otherwise — a wrong
 * schema is a configuration bug, never a silent fallback.
 */
function assertUserMetadataShape(schema: z.ZodObject, name: string): void {
  const missing = USER_METADATA_BASE_FIELDS.filter(
    (field) => !(field in schema.shape),
  );
  if (missing.length > 0) {
    throw new Error(
      `[defineZodUserMetadata] "${name}" schema is missing required ` +
        `userMetadata field(s): ${missing.join(', ')}. A userMetadata ` +
        'schema must declare id, userId, dateCreated, dateUpdated, ' +
        'dateDeleted and version (the BaseUserMetadataEntityInterface shape).',
    );
  }
}

/**
 * `zodResource` counterpart for the `userMetadata` config slot: a single
 * zod schema compiles into the entity + create / update / response DTO
 * quad that `RocketsModule` / `RocketsCoreModule` expect — no handwritten
 * entity or DTO classes.
 *
 * Projections (fixed to the userMetadata contract, not field-meta
 * driven):
 * - **create** omits the server-managed fields (`id`, timestamps,
 *   `version`) → `userId` + custom fields. Satisfies
 *   `UserMetadataCreatableInterface`.
 * - **update** omits `userId` + server-managed fields, makes the rest
 *   optional, and keeps `id` required. Satisfies
 *   `UserMetadataModelUpdatableInterface`.
 * - **response** is the full schema (id, userId, timestamps, version,
 *   custom), serialized through the same class-transformer idiom as a
 *   zod resource response DTO.
 *
 * Usually called via the bound `defineUserMetadata` from
 * {@link bindZodResources} so the entity compiler is supplied once.
 */
export function defineZodUserMetadata(
  schema: z.ZodObject,
  options: ZodUserMetadataOptions = {},
): RocketsUserMetadataConfig {
  const name = options.name ?? 'UserMetadata';
  const table = options.table ?? 'userMetadata';

  assertUserMetadataShape(schema, name);

  const compiler = options.repository?.entityCompiler ?? options.entityCompiler;
  if (compiler === undefined) {
    throw new Error(
      '[defineZodUserMetadata] no entity compiler. Use the bound ' +
        '`defineUserMetadata` from bindZodResources(compiler), or pass ' +
        '`entityCompiler` (or `repository.entityCompiler`).',
    );
  }

  const entity =
    getRegisteredEntity(schema) ??
    compiler.compileEntity(schema, { name: `${name}Entity`, table });
  registerSchemaEntity(schema, entity);

  // Server-managed fields never accepted on the wire.
  const createDto = namedZodDto<UserMetadataCreatableInterface>(
    schema.omit({
      id: true,
      dateCreated: true,
      dateUpdated: true,
      dateDeleted: true,
      version: true,
    }),
    `${name}CreateDto`,
  );

  // Update is the editable patch surface: server-managed fields, the
  // identity (`id`) and the immutable `userId` are all excluded — the
  // `/me` controller upserts by the authenticated `user.id`, never from
  // the body — and every remaining field is an optional patch.
  const updateDto = namedZodDto<UserMetadataModelUpdatableInterface>(
    schema
      .omit({
        id: true,
        userId: true,
        dateCreated: true,
        dateUpdated: true,
        dateDeleted: true,
        version: true,
      })
      .partial(),
    `${name}UpdateDto`,
  );

  const responseDto = compileDtoClass(schema, `${name}ResponseDto`);

  return {
    entity,
    createDto,
    updateDto,
    responseDto,
    repository: options.repository,
  };
}
