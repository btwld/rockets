import type { PlainLiteralObject, Provider, Type } from '@nestjs/common';
import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UseHooks } from '@bitwild/rockets-common';
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
import { Operation } from '@concepta/nestjs-common';
import type {
  JoinClause,
  RelationActionConfig,
  RepositoryModuleInterface,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import type { RocketsResourceConfig } from '../../domain/interfaces/rockets-resource.interface';
import type {
  RocketsResourceDefinition,
  ResourceDtoConfig,
  ResourceHandlerOverrides,
  ResourceOperationName,
  ResourceOperationOverride,
  ResourceRelationEntry,
} from '../../domain/interfaces/rockets-resource-definition.interface';
import type { RocketsResourceBundle } from '../../domain/interfaces/rockets-resource-bundle.interface';
import { createPaginatedDto } from './paginated-dto.factory';
import { createBoundRelation } from './relation';

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
 * Default persistence module when `definition.persistence.module` is omitted.
 * TypeORM covers the vast majority of consumer cases. Override by setting
 * `persistence.module` on the definition for alternate adapters.
 */
const DEFAULT_PERSISTENCE_MODULE: RepositoryModuleInterface =
  TypeOrmRepositoryModule;

/**
 * Build a ready-to-consume `RocketsResourceBundle` from a minimal
 * `RocketsResourceDefinition`. Applies sensible defaults and merges in
 * every override field the consumer supplies.
 *
 * The returned bundle contains both the `core` config (forwarded into
 * `RocketsCoreModule.resources[]`) and the `persistence` entry (aggregated
 * into `repositoryPersistence` by `aggregateResources`). Consumers don't
 * touch either directly — `RocketsModule.forRoot` accepts bundles and
 * unpacks them internally.
 *
 * @example
 * Input — minimal `RocketsResourceDefinition`:
 * ```ts
 * const petResource = defineResource({
 *   key: 'pet',
 *   entity: PetEntity,
 *   dto: {
 *     response: PetResponseDto,
 *     create: PetCreateDto,
 *     update: PetUpdateDto,
 *   },
 *   relations: (relation) => [relation(PetVaccinationEntity, 'vaccinations')],
 *   hooks: [OwnerScopeHook],
 *   handlers: { create: PetCreateHandler },
 * });
 * ```
 *
 * Output — a `RocketsResourceBundle` with three pre-wired parts:
 * ```ts
 * {
 *   // Forwarded into RocketsCoreModule.resources[]
 *   core: {
 *     crud: {
 *       controller: {
 *         path: 'pets',                // from definition.path
 *         entity: 'pet',
 *         resolver: CrudOperationResolver,
 *         extraDecorators: [ApiBearerAuth(), ApiTags('Pets'), UseHooks(OwnerScopeHook)],
 *         response: { resource: PetResponseDto, paginated: PetPaginatedDto },
 *       },
 *       operations: [
 *         { operation: 'list',   query:   CrudListQuery,  extraDecorators: [CrudJoin(...)] },
 *         { operation: 'read',   query:   CrudReadQuery,  extraDecorators: [CrudJoin(...)] },
 *         { operation: 'create', command: CrudCreateCommand, commandHandler: PetCreateHandler,
 *           request: { body: PetCreateDto } },
 *         { operation: 'update', command: CrudUpdateCommand, request: { body: PetUpdateDto } },
 *         { operation: 'delete', command: CrudDeleteCommand },
 *       ],
 *     },
 *     providers: [PetCreateHandler, OwnerScopeHook], // auto-extracted from handlers+hooks
 *   },
 *
 *   // Aggregated into repositoryPersistence by aggregateResources()
 *   persistence: {
 *     module: TypeOrmRepositoryModule,              // default
 *     entity: { key: 'pet', entity: PetEntity },
 *   },
 *
 *   // Consumed by aggregateResources() for cross-resource relation validation
 *   meta: {
 *     key: 'pet',
 *     entityClass: PetEntity,
 *     relations: [
 *       { source: PetEntity, target: PetVaccinationEntity, propertyName: 'vaccinations' },
 *     ],
 *   },
 * }
 * ```
 */
export function defineResource<E extends PlainLiteralObject>(
  definition: RocketsResourceDefinition<E>,
): RocketsResourceBundle<E> {
  validateDefinition(definition);

  const {
    key,
    entity,
    path,
    tags,
    dto = {},
    operations = DEFAULT_OPERATIONS,
    relations: relationsInput,
    persistence,
    hooks,
    handlers = {},
    providers = [],
    autoRegisterHandlers = true,
    overrides = {},
  } = definition;

  // Resolve `relations` once. The builder form receives a `BoundRelation<E>`
  // closed over the resource entity, which makes the source impossible
  // to mistype. The array form is preserved for advanced cases (junction
  // tables, programmatic composition) where the source is intentionally
  // not the resource entity.
  const relations = resolveRelations(key, entity, relationsInput);

  const controllerOverrides = overrides.controller ?? {};
  const operationOverrides = overrides.operations ?? {};

  const bearerAuth = controllerOverrides.bearerAuth ?? true;
  const resolver = controllerOverrides.resolver ?? CrudOperationResolver;

  const response = buildResponse(dto, controllerOverrides.response);

  const extraDecorators = buildControllerDecorators({
    tags,
    bearerAuth,
    hooks,
    extra: controllerOverrides.extraDecorators,
  });

  const controller: CrudControllerOptionsInterface<PlainLiteralObject> & {
    extraDecorators?: CrudDecorator[];
  } = {
    path,
    entity: key,
    resolver,
    extraDecorators,
  };
  if (controllerOverrides.adapter !== undefined) {
    controller.adapter = controllerOverrides.adapter;
  }
  if (controllerOverrides.transactional !== undefined) {
    controller.transactional = controllerOverrides.transactional;
  }
  if (response) controller.response = response;
  if (controllerOverrides.request) {
    controller.request = controllerOverrides.request;
  }

  // Controller-view joins: every relation with include !== 'never'
  // contributes a single @CrudJoin entry on List/Read. Federated relations
  // are still surfaced to the controller — the federation toggle only
  // switches the repository execution strategy, not endpoint visibility.
  const controllerJoins = buildControllerJoins(relations);

  const ops: CrudOperationOptions<PlainLiteralObject>[] = operations.map((op) =>
    buildOperation(op, {
      dto,
      joins: controllerJoins,
      handlers,
      override: operationOverrides[op],
    }),
  );

  const resourceProviders = mergeProviders({
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

  return {
    core,
    persistence: {
      module: persistence?.module ?? DEFAULT_PERSISTENCE_MODULE,
      entity: entityOptions,
    },
    meta: {
      key,
      entityClass: entity,
      relations: relations ?? [],
    },
  };
}

function validateDefinition<E extends PlainLiteralObject>(
  definition: RocketsResourceDefinition<E>,
): void {
  if (!definition.key || typeof definition.key !== 'string') {
    throw new Error(
      'defineResource: `key` is required and must be a non-empty string.',
    );
  }
  if (!definition.entity || typeof definition.entity !== 'function') {
    throw new Error(
      `defineResource[${definition.key}]: \`entity\` must be a class constructor.`,
    );
  }
  if (!isNonEmptyStringOrStringArray(definition.path)) {
    throw new Error(
      `defineResource[${definition.key}]: \`path\` is required and must be a non-empty string or string array.`,
    );
  }
  if (!isNonEmptyStringArray(definition.tags)) {
    throw new Error(
      `defineResource[${definition.key}]: \`tags\` is required and must be a non-empty array of non-empty strings.`,
    );
  }
  if (definition.operations && definition.operations.length === 0) {
    throw new Error(
      `defineResource[${definition.key}]: \`operations\` cannot be an empty array.`,
    );
  }
  // Relations validation is deferred to `resolveRelations` because the
  // builder form (`relations: (relation) => […]`) produces the array
  // lazily.
}

/**
 * Normalise the `relations` field into a flat `ResourceRelationEntry[]`.
 *
 * Accepts both supported input shapes:
 * - `undefined` → returns `undefined`.
 * - Array of `ResourceRelationEntry` → returned verbatim after validation.
 * - Builder `(relation) => […]` → invoked with a `BoundRelation<E>`
 *   closed over the resource entity; the returned array is then
 *   validated.
 *
 * Centralising the resolution here lets the rest of `defineResource`
 * stay agnostic of which input shape the consumer chose.
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
 * Reject malformed relation entries early so downstream consumers get a
 * descriptive error at module-definition time instead of a cryptic failure
 * from the repository or CrudJoin machinery during bootstrap.
 *
 * Type-level checks (target is an `EntityConstructor`, propertyName is
 * `keyof Source`) are enforced by the `relation()` helper signature. The
 * runtime checks here exist for consumers that bypass `relation()` and
 * produce a literal entry by hand — and for a single
 * duplicate-propertyName diagnostic, since the type system cannot detect
 * duplicates across an array.
 */
function assertRelationsValid(
  resourceKey: string,
  relations: readonly ResourceRelationEntry[],
): void {
  const seen = new Set<string>();
  for (const entry of relations) {
    if (typeof entry.source !== 'function') {
      throw new Error(
        `defineResource[${resourceKey}]: every relation must declare a class \`source\` (use the \`relation()\` helper).`,
      );
    }
    if (typeof entry.target !== 'function') {
      throw new Error(
        `defineResource[${resourceKey}]: every relation must declare a class \`target\` or a \`() => Class\` thunk.`,
      );
    }
    if (!entry.propertyName || typeof entry.propertyName !== 'string') {
      throw new Error(
        `defineResource[${resourceKey}]: every relation must have a non-empty string \`propertyName\`.`,
      );
    }
    if (seen.has(entry.propertyName)) {
      throw new Error(
        `defineResource[${resourceKey}]: duplicate relation propertyName "${entry.propertyName}". ` +
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

function buildControllerDecorators(args: {
  tags: readonly string[];
  bearerAuth: boolean;
  hooks: readonly Type[] | undefined;
  extra: readonly ClassDecorator[] | undefined;
}): CrudDecorator[] {
  const decorators: CrudDecorator[] = [];
  // Wrap each with `applyDecorators` so the result conforms to
  // `CrudDecorator` (the upstream `extraDecorators` element type). This
  // is a zero-cost passthrough at runtime.
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
 * Convert the resource-level `relations` array into the `JoinClause[]`
 * shape expected by the upstream `@CrudJoin` decorator. Entries flagged
 * `include: 'never'` are filtered out and never surfaced on the controller.
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
 * Translate the resource-level `relations` array into the
 * `RepositoryProviderOptions.relations` map (keyed by propertyName). Only
 * entries carrying persistence-layer flags (`federated`, `distinctFilter`)
 * produce a map entry; bare relations are represented solely via the
 * controller-side `@CrudJoin`.
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
    // Skip empty entries — we don't want to register a no-op relation
    // that could shadow underlying ORM metadata.
    if (Object.keys(cfg).length === 0) continue;
    map[entry.propertyName] = cfg;
  }
  return Object.keys(map).length ? map : undefined;
}

interface BuildOperationArgs {
  readonly dto: ResourceDtoConfig;
  readonly joins: readonly JoinClause[] | undefined;
  readonly handlers: ResourceHandlerOverrides;
  readonly override: ResourceOperationOverride | undefined;
}

function buildOperation(
  op: ResourceOperationName,
  args: BuildOperationArgs,
): CrudOperationOptions<PlainLiteralObject> {
  const { dto, joins, handlers, override = {} } = args;
  const extraDecorators = buildOperationDecorators({ op, joins, override });

  // The shared envelope contains every property common to both the query
  // and command branches of `CrudOperationOptions<E>`. Each case below
  // then adds either `query/queryHandler` or `command/commandHandler` to
  // satisfy exactly one branch of the discriminated union.
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
 * Builds the shared optional properties present on every operation
 * (path, methodName, transactional, request, response, extraDecorators).
 * Returned as a spreadable partial so we can compose each discriminated
 * branch cleanly.
 */
function optionalEnvelope(
  override: ResourceOperationOverride,
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
  override: ResourceOperationOverride;
}): CrudDecorator[] {
  const decorators: CrudDecorator[] = [];

  // Auto-apply @CrudJoin to List + Read when relations are declared at the
  // resource level. Operation-level override can add more via extraDecorators.
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

function mergeProviders(args: {
  handlers: ResourceHandlerOverrides;
  hooks: readonly Type[] | undefined;
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
