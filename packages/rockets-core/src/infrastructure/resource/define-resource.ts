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
 * Turn a small resource definition into everything Rockets needs to register that resource.
 *
 * - You describe the intent (entity, DTOs, relations, hooks, handlers, …)
 * - Rockets fills in defaults and generates the actual CRUD wiring
 *
 * The return value is a `RocketsResourceBundle` with three friendlier buckets:
 * - `core` → the CRUD config (`CrudModule` uses this to create routes)
 * - `persistence` → how this entity is stored (used to build `RepositoryModule.forFeature(...)`)
 * - `meta` → the extra facts Rockets needs to check relations on startup
 *   (`prepareResourceRegistration`)
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

  // Turn the user’s `relations` field into one concrete list.
  // - `relations: (r) => [...]` is the typed builder form
  // - `relations: [...]` is the advanced / escape-hatch form
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
  readonly override: ResourceOperationOverride | undefined;
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
