import type { PlainLiteralObject, Provider, Type } from '@nestjs/common';
import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { UseHooks, deriveEntityKey } from '@bitwild/rockets-common';
import {
  CrudOperationResolver,
  CrudListQuery,
  CrudReadQuery,
  CrudCreateCommand,
  CrudUpdateCommand,
  CrudReplaceCommand,
  CrudDeleteCommand,
  CrudSoftDeleteCommand,
  CrudRestoreCommand,
  CrudJoin,
  ConfigurableCrudGeneratedOptions,
  CrudControllerOptionsInterface,
  CrudOperationOptions,
  CrudRequestConfig,
  CrudResponseConfig,
} from '@bitwild/rockets-crud';
import { Operation } from '@bitwild/rockets-common';
import type {
  JoinClause,
  RelationActionConfig,
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import type { CrudParamOptionInterface } from '@bitwild/rockets-crud';
import pluralize from 'pluralize';
import type { RocketsResourceConfig } from '../../domain/interfaces/rockets-resource.interface';
import type {
  RocketsResourceDefinition,
  ResourceDtoConfig,
  ResourceHandlerOverrides,
  ResourceOperationName,
  ResourceOperationConfig,
  ResourceOperationsObject,
  ResourceRelationEntry,
} from '../../domain/interfaces/rockets-resource-definition.interface';
import type { CrudResource } from '../../domain/interfaces/rockets-resource-bundle.interface';
import type { RocketsSubResourceDefinition } from '../../domain/interfaces/rockets-resource-definition.interface';
import { createPaginatedDto } from './paginated-dto.factory';
import { createBoundRelation } from './relation';
import { defaultParentParam } from './define-sub-resource';
import { PathScopeHook } from '../hooks/path-scope.hook';
import { PathScopeGuard } from '../guards/path-scope.guard';
import { AfterCreateReloadHook } from '../hooks/after-create-reload.hook';
import { ResourceKind } from '../../domain/interfaces/resource-kind.enum';
import type { RocketsEntityHookForResource } from '../hooks/entity-hook';

type CrudDecorator = ReturnType<typeof applyDecorators>;

/**
 * Default operation set when `definition.operations` is omitted.
 */
const DEFAULT_OPERATIONS: readonly ResourceOperationName[] = [
  Operation.List,
  Operation.Read,
  Operation.Create,
  Operation.Update,
  Operation.Delete,
] as const;

/**
 * Convert a camelCase / PascalCase key to a kebab-cased plural URL path:
 * `petVaccination` → `pet-vaccinations`. Uses the `pluralize` library so
 * irregular plurals (`category → categories`, `person → people`) work
 * out of the box.
 */
function defaultPathFromKey(key: string): string {
  const kebab = key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase();
  return pluralize(kebab);
}

/**
 * Convert a camelCase / PascalCase key to a humanised + pluralised
 * Swagger tag: `petVaccination` → `Pet Vaccinations`.
 */
function defaultTagFromKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  if (words.length === 0) return key;
  // Pluralise only the last word — `petVaccination` → `Pet Vaccinations`,
  // not `Pets Vaccinations`.
  words[words.length - 1] = pluralize(words[words.length - 1]);
  return words.join(' ');
}

/**
 * Turn a small resource definition into everything Rockets needs to register that resource.
 *
 * - You describe the intent (entity, DTOs, relations, hooks, handlers, …)
 * - Rockets fills in defaults and generates the actual CRUD wiring
 *
 * The return value is a `CrudResource` with three friendlier buckets:
 * - `core` → the CRUD config (`CrudModule` uses this to create routes)
 * - `persistence` → how this entity is stored (used to build `RepositoryModule.forFeature(...)`)
 * - `meta` → the extra facts Rockets needs to check relations on startup
 *   (`buildAppRegistrationPlan`)
 *
 * @example
 * Input → output:
 *
 * ```ts
 * // Input
 * const petResource = defineResource({
 *   key: 'pet',
 *   entity: PetEntity,
 *   // path / tags omitted — derived as 'pets' / ['Pets']
 *   operations: {
 *     list:   { response: PetDto },
 *     create: { body: PetCreateDto, response: PetDto },
 *   },
 * });
 *
 * // Output
 * {
 *   kind: ResourceKind.Crud,
 *   core: {
 *     crud: {
 *       controller: {
 *         path: 'pets',                    // derived
 *         entity: 'pet',
 *         resolver: CrudOperationResolver,
 *         extraDecorators: [ApiBearerAuth(), ApiTags('Pets')],
 *       },
 *       operations: [
 *         { operation: Operation.List,   response: { resource: PetDto, paginated: ... } },
 *         { operation: Operation.Create, request: { body: PetCreateDto },
 *           response: { resource: PetDto },
 *           command: CrudCreateCommand },
 *       ],
 *     },
 *     providers: [],
 *   },
 *   persistence: {
 *     module: TypeOrmRepositoryModule,    // default
 *     entity: { key: 'pet', entity: PetEntity, relations: [] },
 *   },
 *   meta: { key: 'pet', entityClass: PetEntity, relations: [] },
 * }
 *
 * // What gets wired at boot:
 * //  • One CrudModule.forFeature(bundle.core)
 * //  • One row appended to RepositoryModule.forFeature plan
 * //  • Class-level decorators stamped on the auto-generated controller
 * ```
 */
export function defineResource<E extends PlainLiteralObject>(
  definition: RocketsResourceDefinition<E>,
): CrudResource<E> {
  validateDefinition(definition);

  // `key` is optional in the input — derive from the entity class name
  // when omitted (`PetTagEntity` → `'petTag'`). Explicit `key` always
  // wins, which is the escape hatch for namespaced or awkward names.
  const key = definition.key ?? deriveEntityKey(definition.entity);

  const {
    entity,
    path: pathInput,
    tags: tagsInput,
    dto: dtoInput = {},
    operations: operationsInput = DEFAULT_OPERATIONS,
    relations: relationsInput,
    persistence,
    hooks: hooksInput,
    handlers: handlersInput = {},
    providers = [],
    autoRegisterHandlers = true,
    decorators: extraClassDecorators,
    public: isPublic = false,
    request: controllerRequest,
  } = definition;

  // Auto-derive path / tags from key when omitted. Consumers can still
  // declare them explicitly for legacy mounts, versioned URLs, or custom
  // Swagger grouping.
  const path: string | string[] = pathInput ?? defaultPathFromKey(key);
  const tags: readonly string[] = tagsInput ?? [defaultTagFromKey(key)];

  // Operations may arrive as the legacy `Operation[]` array or as the new
  // keyed object form. `normalizeOperationsInput` returns a single tuple
  // we can feed into the rest of the builder uniformly.
  const normalized = normalizeOperationsInput(key, operationsInput, {
    dto: dtoInput,
    handlers: handlersInput,
  });
  const operations = normalized.operations;
  const dto = normalized.dto;
  const handlers = normalized.handlers;
  const operationOverrides = normalized.operationOverrides;
  const hooks = hooksInput;

  // Turn the user’s `relations` field into one concrete list.
  // - `relations: (r) => [...]` is the typed builder form
  // - `relations: [...]` is the advanced / escape-hatch form
  const relations = resolveRelations(key, entity, relationsInput);

  const bearerAuth = !isPublic;
  const response = buildResponse(dto, undefined);

  const extraDecorators = buildControllerDecorators<E>({
    tags,
    bearerAuth,
    hooks,
    extra: extraClassDecorators,
  });

  const controller: CrudControllerOptionsInterface<PlainLiteralObject> & {
    extraDecorators?: CrudDecorator[];
  } = {
    path,
    entity: key,
    resolver: CrudOperationResolver,
    extraDecorators,
  };
  if (response) controller.response = response;
  if (controllerRequest) controller.request = controllerRequest;

  // Add joins to List/Read for anything that should show up in API responses
  // (`include: 'never'` stays server-side only).
  const controllerJoins = buildControllerJoins(relations);

  const ops: CrudOperationOptions<PlainLiteralObject>[] = operations.map((op) =>
    buildOperation(op, {
      dto,
      joins: controllerJoins,
      handlers,
      override: operationOverrides[op],
    }),
  );

  const resourceProviders = mergeProviders<E>({
    handlers,
    hooks,
    extra: providers,
    autoRegisterHandlers,
  });

  const crud: ConfigurableCrudGeneratedOptions<PlainLiteralObject> = {
    controller,
    operations: ops,
  };

  const core: RocketsResourceConfig = {
    crud,
    providers: resourceProviders,
  };

  const persistenceRelations = buildPersistenceRelations(relations);
  const entityOptions: RepositoryProviderOptions<E> = {
    key,
    entity,
    ...(persistenceRelations ? { relations: persistenceRelations } : {}),
  };

  // Materialise sub-resources. Each one becomes a fully-formed bundle
  // bound to the parent's path/key. Recursion is handled implicitly:
  // calling `defineResource()` on the materialised sub spec processes
  // its own `subResources` field, so an N-level tree composes naturally.
  const subResourceBundles: CrudResource[] = [];
  if (definition.subResources) {
    const subs = definition.subResources as Readonly<
      Record<string, RocketsSubResourceDefinition | undefined>
    >;
    for (const segment of Object.keys(subs)) {
      const sub = subs[segment];
      if (!sub) continue;
      const subBundle = materialiseSubResource({
        parentKey: key,
        parentPath: path,
        parentTags: tags,
        parentPersistenceModule: persistence?.module,
        segment,
        sub,
      });
      subResourceBundles.push(subBundle);
    }
  }

  const bundle: CrudResource<E> = {
    kind: ResourceKind.Crud,
    core,
    persistence: {
      ...(persistence?.module ? { module: persistence.module } : {}),
      entity: entityOptions,
    },
    meta: {
      key,
      entityClass: entity,
      relations: relations ?? [],
    },
    ...(subResourceBundles.length ? { subResources: subResourceBundles } : {}),
  };

  return bundle;
}

/**
 * Compose the parent's path + segment into the sub-resource's path,
 * inject the auto path-scope hook + `@ApiParam` decorators, and call
 * `defineResource()` recursively on the materialised spec.
 */
function materialiseSubResource(args: {
  readonly parentKey: string;
  readonly parentPath: string | readonly string[];
  readonly parentTags: readonly string[];
  readonly parentPersistenceModule: RepositoryModuleInterface | undefined;
  readonly segment: string;
  readonly sub: RocketsSubResourceDefinition;
}): CrudResource {
  const {
    parentKey,
    parentPath,
    parentTags,
    parentPersistenceModule,
    segment,
    sub,
  } = args;

  if (typeof segment !== 'string' || segment.length === 0) {
    throw new Error(
      `defineResource(${parentKey}): subResources keys must be non-empty strings ` +
        `(got "${String(segment)}").`,
    );
  }

  const parentParam = sub.parentParam ?? defaultParentParam(parentKey);
  const parentForeignKey = sub.parentForeignKey ?? parentParam;

  // The segment key (`keyof Parent`, e.g. `petTags`) drives type-safety
  // — only real properties of the parent entity are accepted. The URL
  // shape defaults to `kebab-case(segment)` (e.g. `pet-tags`) but can
  // be overridden via `sub.urlSegment` when the entity property name
  // and the user-facing URL need to differ.
  const urlSegment =
    sub.urlSegment ??
    segment
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .toLowerCase();

  const composePath = (p: string): string =>
    `${p.replace(/\/+$/, '')}/:${parentParam}/${urlSegment}`;
  const composedPath: string | string[] = Array.isArray(parentPath)
    ? (parentPath as readonly string[]).map(composePath)
    : composePath(parentPath as string);

  const def = sub.definition;
  // Derive sub key the same way `defineResource` does so any reference
  // here (hook factory, error messages) sees the same string the outer
  // recursion will compute. Explicit `def.key` always wins.
  const subKey = def.key ?? deriveEntityKey(def.entity);
  const tags = def.tags ?? parentTags;

  // Auto-inject the parent's `@ApiParam` on every operation so OpenAPI
  // documents the URL param.
  const parentApiParam = ApiParam({
    name: parentParam,
    type: 'string',
    required: true,
    description: `Parent ${parentKey} id (URL path).`,
  });

  // Compose the controller-level `request.params` map. User-declared
  // params on `def.request.params` win (so consumers can opt different
  // types/fields), with `id` (primary) and parent param as defaults.
  const userControllerParams =
    (def.request?.params as Record<
      string,
      CrudParamOptionInterface<PlainLiteralObject>
    >) ?? {};
  const composedRequest: CrudRequestConfig<PlainLiteralObject> = {
    ...def.request,
    params: {
      id: { field: 'id', type: 'uuid', primary: true },
      [parentParam]: { field: parentParam, type: 'uuid' },
      ...userControllerParams,
    },
  };

  // Append the parent `@ApiParam` decorator to each declared operation
  // for OpenAPI documentation. Sub-resources require the keyed
  // `operations` form because the array form has no per-op slot.
  const composedOperations = composeSubResourceOperationsDecorators(
    def.operations,
    parentApiParam,
    parentKey,
  );

  // Auto-inject PathScopeHook for the (entity, parentParam, parentForeignKey)
  // triple. It scopes reads + stamps the FK on creates, eliminating the
  // boilerplate of hand-writing a scope hook per junction table. The
  // entity is propagated so the generated subclass is decorated with
  // `@EntityHook({ entity })` — internal writes to other entities will
  // not re-trigger this scope.
  const ScopeHook = PathScopeHook.for(
    def.entity,
    parentParam,
    parentForeignKey,
  );

  // Opt-in AfterCreateReloadHook. Off by default because the extra
  // DB round-trip is not free, and the underlying behaviour
  // (`save()` omitting eager relations) is adapter-specific. Set
  // `reloadAfterCreate: true` on the sub when its entity declares
  // eager relations that consumers depend on.
  const ReloadHook = sub.reloadAfterCreate
    ? AfterCreateReloadHook.for(def.entity)
    : undefined;

  const composedHooks = [
    ScopeHook,
    ...(ReloadHook ? [ReloadHook] : []),
    ...(def.hooks ?? []),
  ];

  // Auto-inject PathScopeGuard unless explicitly disabled. It enforces
  // authenticated-actor + parent-ownership at the HTTP layer (so
  // 401/404 propagate with intended status, vs hooks being wrapped to
  // 500 by the upstream membrane). The guard is added both as a
  // provider (so DI can resolve it) and as a class-level decorator
  // (so it runs on every operation).
  //
  // `parentOwnerColumn` is required (no default) so multi-tenant
  // applications cannot accidentally ship a sub-resource with the
  // wrong ownership column. Opt out entirely with
  // `disablePathScopeGuard: true` for public parents.
  if (!sub.disablePathScopeGuard && !sub.parentOwnerColumn) {
    throw new Error(
      `defineSubResource(${subKey}): must declare \`parentOwnerColumn\` ` +
        `(e.g. 'userId', 'orgId') or opt out with \`disablePathScopeGuard: true\`. ` +
        `The auto guard cannot pick a default safely — wrong column = silent 404 for everyone.`,
    );
  }
  const ScopeGuard = sub.disablePathScopeGuard
    ? undefined
    : PathScopeGuard.for(
        parentParam,
        parentKey,
        sub.parentOwnerColumn as string,
      );

  const composedDecorators: readonly ClassDecorator[] = [
    ...(def.decorators ?? []),
    parentApiParam,
    ...(ScopeGuard ? [UseGuards(ScopeGuard) as ClassDecorator] : []),
  ];

  const composedProviders: readonly Provider[] = ScopeGuard
    ? [...(def.providers ?? []), ScopeGuard]
    : def.providers ?? [];

  const persistenceModule = def.persistence?.module ?? parentPersistenceModule;

  // Build the materialised definition. Path comes from the composer,
  // tags inherit from parent if not declared, hooks include the scope
  // hook, decorators include the parent ApiParam, and the
  // controller-level `request.params` declares both `id` and the
  // parent param.
  const materialised: RocketsResourceDefinition<PlainLiteralObject> = {
    ...def,
    path: composedPath,
    tags,
    hooks: composedHooks,
    providers: composedProviders,
    persistence: persistenceModule ? { module: persistenceModule } : {},
    operations: composedOperations,
    decorators: composedDecorators,
    request: composedRequest,
  };

  return defineResource(materialised);
}

/**
 * Append the parent `@ApiParam` decorator to every declared operation
 * for OpenAPI documentation. Sub-resources require the keyed
 * `operations` form (or `undefined` for the default set) because the
 * array form has no per-op slot.
 */
function composeSubResourceOperationsDecorators(
  declared:
    | readonly ResourceOperationName[]
    | ResourceOperationsObject
    | undefined,
  parentApiParam: ClassDecorator,
  parentKey: string,
): readonly ResourceOperationName[] | ResourceOperationsObject | undefined {
  if (declared !== undefined && Array.isArray(declared)) {
    throw new Error(
      `defineResource(${parentKey}): a sub-resource declared its operations as an array. ` +
        `Sub-resources require the keyed \`operations: { list: { ... }, create: { ... } }\` form ` +
        `so the parent \`@ApiParam\` can be appended per operation.`,
    );
  }
  // When the sub omits operations, fall through to defineResource's
  // default operation set. The parent `@ApiParam` already lives on the
  // controller class via root-level `decorators`, so the OpenAPI doc
  // still surfaces the param even on default-only ops.
  if (declared === undefined) return undefined;

  const obj = declared as ResourceOperationsObject;
  type OpKey = keyof ResourceOperationsObject;
  const composed: { [K in OpKey]?: ResourceOperationsObject[K] } = {};
  const opKeys: readonly OpKey[] = [
    'list',
    'read',
    'create',
    'update',
    'replace',
    'delete',
    'restore',
  ];
  for (const k of opKeys) {
    const cfg = obj[k];
    if (!cfg) continue;
    composed[k] = {
      ...cfg,
      decorators: [...(cfg.decorators ?? []), parentApiParam],
    } as ResourceOperationsObject[typeof k];
  }
  return composed;
}

function validateDefinition<E extends PlainLiteralObject>(
  definition: RocketsResourceDefinition<E>,
): void {
  if (!definition.entity || typeof definition.entity !== 'function') {
    throw new Error('defineResource: `entity` must be a class constructor.');
  }
  if (
    definition.key !== undefined &&
    (typeof definition.key !== 'string' || definition.key.length === 0)
  ) {
    throw new Error(
      `defineResource(${definition.entity.name}): when provided, ` +
        '`key` must be a non-empty string.',
    );
  }
  const tag = definition.key ?? definition.entity.name;
  // path / tags are optional — auto-derived from `key` when omitted.
  // Validate only when explicitly provided so a malformed value (empty
  // string, empty array, non-string entries) still fails fast.
  if (
    definition.path !== undefined &&
    !isNonEmptyStringOrStringArray(definition.path)
  ) {
    throw new Error(
      `defineResource(${tag}): when provided, \`path\` must be a non-empty string or string array.`,
    );
  }
  if (
    definition.tags !== undefined &&
    !isNonEmptyStringArray(definition.tags)
  ) {
    throw new Error(
      `defineResource(${tag}): when provided, \`tags\` must be a non-empty array of non-empty strings.`,
    );
  }
  if (
    Array.isArray(definition.operations) &&
    definition.operations.length === 0
  ) {
    throw new Error(
      `defineResource(${tag}): \`operations\` cannot be an empty array.`,
    );
  }
  if (
    definition.operations !== undefined &&
    !Array.isArray(definition.operations) &&
    typeof definition.operations === 'object' &&
    Object.keys(definition.operations).length === 0
  ) {
    throw new Error(
      `defineResource(${tag}): \`operations\` cannot be an empty object.`,
    );
  }
  // Full relation checks happen in `resolveRelations` (the builder may build lazily).
}

/**
 * Read the `relations` field, whether the user passed an array or a builder.
 *
 * - `undefined` means “no relations”
 * - an array is validated
 * - a function is called to build the array (and then validated)
 */
function resolveRelations<E extends PlainLiteralObject>(
  key: string,
  entity: RocketsResourceDefinition<E>['entity'],
  input: RocketsResourceDefinition<E>['relations'],
): ReadonlyArray<ResourceRelationEntry<E>> | undefined {
  if (input === undefined) return undefined;
  const resolved =
    typeof input === 'function' ? input(createBoundRelation(entity)) : input;
  assertRelationsValid(key, resolved);
  return resolved;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString)
  );
}

function isNonEmptyStringOrStringArray(
  value: unknown,
): value is string | readonly string[] {
  return isNonEmptyString(value) || isNonEmptyStringArray(value);
}

/**
 * Basic sanity checks for the relations list.
 *
 * The `relation()` helper already prevents a lot of mistakes at compile time, but
 * this still catches:
 * - hand-built entries that forgot `source` / `target` / `propertyName`
 * - duplicate `propertyName` values (TypeScript can’t see duplicates in an array)
 */
function assertRelationsValid(
  resourceKey: string,
  relations: readonly ResourceRelationEntry[],
): void {
  const seen = new Set<string>();
  for (const entry of relations) {
    if (typeof entry.source !== 'function') {
      throw new Error(
        `defineResource(${resourceKey}): every relation must declare a class \`source\` (use the \`relation()\` helper).`,
      );
    }
    if (typeof entry.target !== 'function') {
      throw new Error(
        `defineResource(${resourceKey}): every relation must declare a class \`target\` or a \`() => Class\` thunk.`,
      );
    }
    if (!entry.propertyName || typeof entry.propertyName !== 'string') {
      throw new Error(
        `defineResource(${resourceKey}): every relation must have a non-empty string \`propertyName\`.`,
      );
    }
    if (seen.has(entry.propertyName)) {
      throw new Error(
        `defineResource(${resourceKey}): duplicate relation propertyName "${entry.propertyName}". ` +
          `Each property on the source entity may carry at most one relation declaration.`,
      );
    }
    seen.add(entry.propertyName);
  }
}

function buildResponse(
  dto: ResourceDtoConfig,
  override: CrudResponseConfig | undefined,
): CrudResponseConfig | undefined {
  const resource = override?.resource ?? dto.response;
  if (!resource) return override;

  const paginated =
    override?.paginated ?? dto.paginated ?? createPaginatedDto(resource);
  const collection = override?.collection;

  const built: CrudResponseConfig = {
    resource,
    paginated,
    ...(collection !== undefined && { collection }),
    ...(override?.returnDeleted !== undefined && {
      returnDeleted: override.returnDeleted,
    }),
    ...(override?.returnRestored !== undefined && {
      returnRestored: override.returnRestored,
    }),
    ...(override?.serialization !== undefined && {
      serialization: override.serialization,
    }),
  };

  return built;
}

function buildControllerDecorators<E extends PlainLiteralObject>(args: {
  tags: readonly string[];
  bearerAuth: boolean;
  hooks: readonly RocketsEntityHookForResource<E>[] | undefined;
  extra: readonly ClassDecorator[] | undefined;
}): CrudDecorator[] {
  const decorators: CrudDecorator[] = [];
  // Nest’s decorator typing is picky; `applyDecorators` keeps the return type clean.
  if (args.bearerAuth) decorators.push(applyDecorators(ApiBearerAuth()));
  decorators.push(applyDecorators(ApiTags(...args.tags)));
  if (args.hooks?.length) {
    decorators.push(applyDecorators(UseHooks(...args.hooks)));
  }
  if (args.extra?.length) {
    for (const d of args.extra) decorators.push(applyDecorators(d));
  }
  return decorators;
}

/**
 * Pick which relations should affect List/Read API responses.
 *
 * `include: 'never'` is intentionally excluded (server-only / persistence-only data).
 */
function buildControllerJoins(
  relations: readonly ResourceRelationEntry[] | undefined,
): readonly JoinClause[] | undefined {
  if (!relations?.length) return undefined;
  const clauses = relations
    .filter((r) => r.include !== 'never')
    .map<JoinClause>((r) => ({ relation: r.propertyName }));
  return clauses.length ? clauses : undefined;
}

/**
 * Only the “extra” relation settings need to be stored for repository wiring.
 *
 * A plain relation (no `federated` / `distinctFilter`) is still exposed via
 * List/Read joins, but it doesn’t need a repository config entry.
 */
function buildPersistenceRelations(
  relations: readonly ResourceRelationEntry[] | undefined,
): Record<string, RelationActionConfig> | undefined {
  if (!relations?.length) return undefined;
  const map: Record<string, RelationActionConfig> = {};
  for (const entry of relations) {
    const cfg: RelationActionConfig = {};
    if (entry.federated !== undefined) cfg.federated = entry.federated;
    if (entry.distinctFilter !== undefined)
      cfg.distinctFilter = entry.distinctFilter;
    // Don’t add empty maps — that can hide the real ORM mapping.
    if (Object.keys(cfg).length === 0) continue;
    map[entry.propertyName] = cfg;
  }
  return Object.keys(map).length ? map : undefined;
}

interface BuildOperationArgs {
  readonly dto: ResourceDtoConfig;
  readonly joins: readonly JoinClause[] | undefined;
  readonly handlers: ResourceHandlerOverrides;
  readonly override: InternalOperationOverride | undefined;
}

/**
 * Build a single CRUD operation (List/Read/Create/…) with the right defaults.
 *
 * Lists/reads are “queries”, everything else is a “command”. The exact Nest/CQRS
 * class used for each op is part of the upstream `nestjs-crud` contract.
 */
function buildOperation(
  op: ResourceOperationName,
  args: BuildOperationArgs,
): CrudOperationOptions<PlainLiteralObject> {
  const { dto, joins, handlers, override = {} } = args;
  const extraDecorators = buildOperationDecorators({ op, joins, override });

  // Shared optional fields (overrides, swagger-ish decorators) — keep each
  // `case` small and easy to read.
  switch (op) {
    case Operation.List:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        query: override.query ?? CrudListQuery,
        ...(handlers.list ? { queryHandler: handlers.list } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Read:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        query: override.query ?? CrudReadQuery,
        ...(handlers.read ? { queryHandler: handlers.read } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Create:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        ...(override.request === undefined && dto.create
          ? { request: { body: dto.create } }
          : {}),
        command: override.command ?? CrudCreateCommand,
        ...(handlers.create ? { commandHandler: handlers.create } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Update:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        ...(override.request === undefined && dto.update
          ? { request: { body: dto.update } }
          : {}),
        command: override.command ?? CrudUpdateCommand,
        ...(handlers.update ? { commandHandler: handlers.update } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Replace:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        ...(override.request === undefined && dto.replace
          ? { request: { body: dto.replace } }
          : {}),
        command: override.command ?? CrudReplaceCommand,
        ...(handlers.replace ? { commandHandler: handlers.replace } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Delete:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        command: override.command ?? CrudDeleteCommand,
        ...(handlers.delete ? { commandHandler: handlers.delete } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.SoftDelete:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        command: override.command ?? CrudSoftDeleteCommand,
        ...(handlers.softDelete ? { commandHandler: handlers.softDelete } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;

    case Operation.Restore:
      return {
        operation: op,
        ...optionalEnvelope(override, extraDecorators),
        command: override.command ?? CrudRestoreCommand,
        ...(handlers.restore ? { commandHandler: handlers.restore } : {}),
      } satisfies CrudOperationOptions<PlainLiteralObject>;
  }
}

/**
 * Small helper for the optional “extra fields” you can set on an operation
 * (custom path, DTO, hooks, per-op decorators, …).
 */
function optionalEnvelope(
  override: InternalOperationOverride,
  extraDecorators: CrudDecorator[],
): {
  path?: string | string[];
  methodName?: string;
  transactional?: boolean;
  request?: CrudRequestConfig<PlainLiteralObject>;
  response?: CrudResponseConfig;
  extraDecorators?: CrudDecorator[];
} {
  return {
    ...(override.path !== undefined && { path: override.path }),
    ...(override.methodName !== undefined && {
      methodName: override.methodName,
    }),
    ...(override.transactional !== undefined && {
      transactional: override.transactional,
    }),
    ...(override.request !== undefined && { request: override.request }),
    ...(override.response !== undefined && { response: override.response }),
    ...(extraDecorators.length && { extraDecorators }),
  };
}

function buildOperationDecorators(args: {
  op: ResourceOperationName;
  joins: readonly JoinClause[] | undefined;
  override: InternalOperationOverride;
}): CrudDecorator[] {
  const decorators: CrudDecorator[] = [];

  // If the resource has joins, add them to List/Read (that’s when clients fetch graphs).
  if (
    args.joins?.length &&
    (args.op === Operation.List || args.op === Operation.Read)
  ) {
    decorators.push(applyDecorators(CrudJoin([...args.joins])));
  }

  if (args.override.hooks?.length) {
    decorators.push(applyDecorators(UseHooks(...args.override.hooks)));
  }

  if (args.override.extraDecorators?.length) {
    for (const d of args.override.extraDecorators) {
      decorators.push(applyDecorators(d));
    }
  }

  return decorators;
}

/**
 * Assemble the Nest `providers: [...]` list for a resource.
 *
 * If you passed custom command/query handler classes, we register them here. Hooks
 * and any `providers: [...]` from the resource definition are included too.
 */
function mergeProviders<E extends PlainLiteralObject>(args: {
  handlers: ResourceHandlerOverrides;
  hooks: readonly RocketsEntityHookForResource<E>[] | undefined;
  extra: readonly Provider[];
  autoRegisterHandlers: boolean;
}): Provider[] {
  const seen = new Set<Provider>();
  const out: Provider[] = [];
  const add = (p: Provider | undefined): void => {
    if (!p) return;
    if (seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };

  if (args.autoRegisterHandlers) {
    const { handlers } = args;
    add(handlers.list);
    add(handlers.read);
    add(handlers.create);
    add(handlers.update);
    add(handlers.replace);
    add(handlers.delete);
    add(handlers.softDelete);
    add(handlers.restore);

    for (const hook of args.hooks ?? []) add(hook);
  }
  for (const p of args.extra) add(p);

  return out;
}

/**
 * Normalises the polymorphic `operations` input.
 *
 * Two shapes are accepted:
 * - `Operation[]` — legacy array; per-op config comes from `dto`,
 *   `handlers`, `overrides.operations`.
 * - `ResourceOperationsObject` — keyed object form; each key holds its own
 *   body/response/handler/hooks/decorators inline.
 *
 * Returns the union of both worlds so the rest of the builder reads one
 * uniform shape.
 */
/**
 * Internal per-operation override shape produced by `normalizeOperationsInput`.
 *
 * Carries everything needed to feed upstream `CrudOperationOptions` for one
 * operation. Not exported — `ResourceOperationConfig` is the consumer-facing
 * shape; this is the framework's intermediate representation.
 */
interface InternalOperationOverride {
  query?: Type;
  command?: Type;
  request?: CrudRequestConfig<PlainLiteralObject>;
  response?: CrudResponseConfig;
  extraDecorators?: readonly (MethodDecorator | ClassDecorator)[];
  transactional?: boolean;
  path?: string | string[];
  methodName?: string;
  hooks?: readonly Type[];
}

function normalizeOperationsInput(
  resourceKey: string,
  input: readonly ResourceOperationName[] | ResourceOperationsObject,
  ctx: {
    dto: ResourceDtoConfig;
    handlers: ResourceHandlerOverrides;
  },
): {
  operations: readonly ResourceOperationName[];
  dto: ResourceDtoConfig;
  handlers: ResourceHandlerOverrides;
  operationOverrides: Partial<
    Record<ResourceOperationName, InternalOperationOverride>
  >;
} {
  if (Array.isArray(input)) {
    // Legacy array form. Validate that any handler the user supplied
    // belongs to an operation actually enabled — a handler in DI but
    // wired to no route is a silent dead-letter.
    const enabled = new Set<ResourceOperationName>(input);
    const handlerToOp: Record<
      keyof ResourceHandlerOverrides,
      ResourceOperationName
    > = {
      list: Operation.List,
      read: Operation.Read,
      create: Operation.Create,
      update: Operation.Update,
      replace: Operation.Replace,
      delete: Operation.Delete,
      softDelete: Operation.SoftDelete,
      restore: Operation.Restore,
    };
    for (const slot of Object.keys(
      ctx.handlers,
    ) as (keyof ResourceHandlerOverrides)[]) {
      if (ctx.handlers[slot] && !enabled.has(handlerToOp[slot])) {
        throw new Error(
          `defineResource(${resourceKey}): handler declared for "${slot}" but operation "${handlerToOp[slot]}" is not in \`operations\`. ` +
            `Either enable the operation or remove the handler — handlers wired to no route never fire.`,
        );
      }
    }
    return {
      operations: input as readonly ResourceOperationName[],
      dto: ctx.dto,
      handlers: ctx.handlers,
      operationOverrides: {},
    };
  }

  const obj = input as ResourceOperationsObject;
  const operations: ResourceOperationName[] = [];
  const handlers: { -readonly [K in keyof ResourceHandlerOverrides]: Type } = {
    ...ctx.handlers,
  };
  const operationOverrides: Partial<
    Record<ResourceOperationName, InternalOperationOverride>
  > = {};

  const dto: { -readonly [K in keyof ResourceDtoConfig]: Type } = {
    ...ctx.dto,
  };

  // Promote per-op response to resource-level `dto.response` ONLY when
  // every read-side operation that declares a response declares the
  // SAME class. Mixing shapes (e.g. `read.response = PublicDto` and
  // `list.response = AdminDto`) would otherwise leak one onto the
  // auto-paginated DTO and any future op that doesn't declare its own —
  // an asymmetric data-disclosure bug. When mixed, the consumer must
  // declare `dto.response` explicitly at the resource level.
  if (!dto.response) {
    const declared = [obj.read?.response, obj.list?.response].filter(
      (r): r is Type => r !== undefined,
    );
    const allSame = declared.every((r) => r === declared[0]);
    if (declared.length > 0 && !allSame) {
      throw new Error(
        `defineResource(${resourceKey}): \`operations.read.response\` and \`operations.list.response\` differ. ` +
          `Declare \`dto.response\` explicitly at the resource level so the auto-paginated DTO and any op without its own response use the right shape.`,
      );
    }
    if (declared.length > 0) dto.response = declared[0];
  }
  // Mirror create/update bodies to dto so handler/decorator pipelines that
  // rely on the resource-level `dto.{create,update}` fallback still see them.
  if (!dto.create && obj.create?.body) dto.create = obj.create.body;
  if (!dto.update && obj.update?.body) dto.update = obj.update.body;
  if (!dto.replace && obj.replace?.body) dto.replace = obj.replace.body;

  const consumeCommon = (
    op: ResourceOperationName,
    cfg: ResourceOperationConfig | undefined,
    handlerSlot: keyof ResourceHandlerOverrides,
    label: string,
  ): void => {
    operations.push(op);
    if (!cfg) return;

    if (cfg.handler) handlers[handlerSlot] = cfg.handler;

    // Conflict detection (Fix #4): the high-level shorthand fields
    // (`body`, `response`) and the low-level escape hatches
    // (`requestOverride`, `responseOverride`) describe overlapping concerns.
    // Specifying both for the same op is ambiguous — last-write-wins
    // precedence is a silent footgun. Throw with a clear message.
    if (cfg.body !== undefined && cfg.requestOverride?.body !== undefined) {
      throw new Error(
        `defineResource(${resourceKey}): \`operations.${label}\` declares both \`body\` and \`requestOverride.body\`. ` +
          `Use one — \`body\` for the high-level shorthand or \`requestOverride.body\` when you also need \`requestOverride.params\`/\`requestOverride.query\` overrides.`,
      );
    }
    if (
      cfg.response !== undefined &&
      cfg.responseOverride !== undefined &&
      (cfg.responseOverride.resource !== undefined ||
        cfg.responseOverride.paginated !== undefined)
    ) {
      throw new Error(
        `defineResource(${resourceKey}): \`operations.${label}\` declares both \`response\` and \`responseOverride.resource/paginated\`. ` +
          `Use \`response\` for the simple case or \`responseOverride\` for the full upstream config — not both.`,
      );
    }

    const next: InternalOperationOverride = operationOverrides[op]
      ? { ...operationOverrides[op] }
      : {};
    if (cfg.path !== undefined) next.path = cfg.path;
    if (cfg.methodName !== undefined) next.methodName = cfg.methodName;
    if (cfg.transactional !== undefined) next.transactional = cfg.transactional;
    if (cfg.hooks !== undefined) next.hooks = cfg.hooks as readonly Type[];
    if (cfg.decorators !== undefined) next.extraDecorators = cfg.decorators;
    if (cfg.requestOverride !== undefined) next.request = cfg.requestOverride;
    if (cfg.responseOverride !== undefined)
      next.response = cfg.responseOverride;
    if (cfg.body !== undefined) {
      next.request = { ...(next.request ?? {}), body: cfg.body };
    }
    if (cfg.response !== undefined) {
      next.response = {
        ...(next.response ?? {}),
        resource: cfg.response,
        ...(cfg.paginated !== undefined ? { paginated: cfg.paginated } : {}),
      };
    }
    operationOverrides[op] = next;
  };

  if (obj.list) consumeCommon(Operation.List, obj.list, 'list', 'list');
  if (obj.read) consumeCommon(Operation.Read, obj.read, 'read', 'read');
  if (obj.create)
    consumeCommon(Operation.Create, obj.create, 'create', 'create');
  if (obj.update)
    consumeCommon(Operation.Update, obj.update, 'update', 'update');
  if (obj.replace)
    consumeCommon(Operation.Replace, obj.replace, 'replace', 'replace');

  if (obj.delete) {
    const op = obj.delete.soft ? Operation.SoftDelete : Operation.Delete;
    const slot: keyof ResourceHandlerOverrides = obj.delete.soft
      ? 'softDelete'
      : 'delete';
    consumeCommon(op, obj.delete, slot, 'delete');
    if (obj.delete.returnDeleted !== undefined) {
      const next: InternalOperationOverride = operationOverrides[op] ?? {};
      next.response = {
        ...(next.response ?? {}),
        returnDeleted: obj.delete.returnDeleted,
      };
      operationOverrides[op] = next;
    }
  }

  if (obj.restore) {
    if (!obj.delete?.soft) {
      throw new Error(
        `defineResource(${resourceKey}): \`operations.restore\` requires \`operations.delete: { soft: true }\`. ` +
          `Restore only applies to soft-deleted rows; with a hard delete there is nothing to restore.`,
      );
    }
    consumeCommon(Operation.Restore, obj.restore, 'restore', 'restore');
    if (obj.restore.returnRestored !== undefined) {
      const next: InternalOperationOverride =
        operationOverrides[Operation.Restore] ?? {};
      next.response = {
        ...(next.response ?? {}),
        returnRestored: obj.restore.returnRestored,
      };
      operationOverrides[Operation.Restore] = next;
    }
  }

  return {
    operations,
    dto,
    handlers,
    operationOverrides,
  };
}
