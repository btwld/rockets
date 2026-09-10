import {
  applyDecorators,
  type PlainLiteralObject,
  type Type,
} from '@nestjs/common';
import {
  AccessControlQuery,
  type CanAccess,
} from '@concepta/nestjs-access-control';

import {
  CrudOperationResolver,
  type ConfigurableCrudGeneratedOptions,
  type CrudControllerOptionsInterface,
  type CrudOperationOptions,
  type CrudRequestConfig,
} from '@concepta/nestjs-crud';
import type { RepositoryProviderOptions } from '@concepta/nestjs-repository';
import type { RocketsResourceConfig } from '../../../domain/interfaces/rockets-resource.interface';
import type { RocketsResourceDefinition } from '../../../domain/interfaces/rockets-resource-definition.interface';
import type { CrudResource } from '../../../domain/interfaces/rockets-resource-bundle.interface';
import type {
  ResourceOperationName,
  RocketsSubResourceDefinition,
} from '../../../domain/interfaces/rockets-resource-definition.interface';
import { ResourceKind } from '../../../domain/interfaces/resource-kind.enum';
import {
  DEFAULT_OPERATIONS,
  defaultPathFromKey,
  defaultTagFromKey,
} from './defaults';
import { validateDefinition } from './validate-definition';
import { resolveRelations } from './resolve-relations';
import { normalizeOperationsInput } from './normalize-operations';
import { buildResponse } from './build-response';
import {
  buildControllerDecorators,
  buildControllerJoins,
} from './build-controller';
import { buildPersistenceRelations } from './build-persistence-relations';
import { buildOperation, mergeProviders } from './build-operation';
import { materialiseSubResource } from './materialise-sub-resource';
import {
  buildAclPlan,
  resolveOperationAcl,
  withAclDecorators,
} from './build-acl';
import { deriveEntityKey } from '../../../common';
import { rocketsSchemaValidation } from '../../../common/utils/standard-schema.util';
import { assertNamedSchema } from '../../../common/utils/open-api-schema.util';
import type { InternalOperationOverride } from './internal-operation.types';

type CrudDecorator = ReturnType<typeof applyDecorators>;

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
 * Minimal — only `entity` is required:
 *
 * ```ts
 * const petResource = defineResource({ entity: PetEntity });
 * // key 'pet', path 'pets', tags ['Pets'], default CRUD ops, DTO = entity shape
 * ```
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
 *     list:   { output: PetDto },
 *     create: { input: PetCreateDto, output: PetDto },
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
 *     // module omitted — aggregator uses RocketsCoreModule's root repository adapter
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

  const key = definition.key ?? deriveEntityKey(definition.entity);

  const {
    entity,
    path: pathInput,
    tags: tagsInput,
    dto: dtoInput = {},
    operations: operationsInput = DEFAULT_OPERATIONS,
    relations: relationsInput,
    repository,
    hooks: hooksInput,
    handlers: handlersInput = {},
    providers = [],
    autoRegisterHandlers = true,
    decorators: extraClassDecorators,
    acl,
    public: isPublic = false,
    request: controllerRequest,
  } = definition;

  const path: string | string[] = pathInput ?? defaultPathFromKey(key);
  const tags: readonly string[] = tagsInput ?? [defaultTagFromKey(key)];

  const normalized = normalizeOperationsInput(key, operationsInput, {
    dto: dtoInput,
    handlers: handlersInput,
  });
  const operations = normalized.operations;
  const dto = normalized.dto;
  const handlers = normalized.handlers;
  const operationOverrides = normalized.operationOverrides;
  const hooks = hooksInput;

  const relations = resolveRelations(key, entity, relationsInput);

  const bearerAuth = !isPublic;
  const response = buildResponse(key, dto, undefined);

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

  // Same bar as `operations.X.input` and `requestOverride.body`: a
  // controller-level body is the fallback for every route that declares
  // none, so an unnamed schema here would inline every one of them.
  if (controllerRequest?.body !== undefined) {
    assertNamedSchema(
      controllerRequest.body,
      `defineResource(${key}): request.body`,
    );
  }
  if (controllerRequest?.bodyBatch !== undefined) {
    assertNamedSchema(
      controllerRequest.bodyBatch,
      `defineResource(${key}): request.bodyBatch`,
    );
  }

  // Every body on this controller validates through Nest's Standard
  // Schema pipe with the Rockets exception factory (structured `details`,
  // issue #55). Upstream reads controller-level `request.validation` as
  // the fallback for every body param and spreads it over its own default
  // factory, so setting it here covers generated routes and per-operation
  // `requestOverride.body` alike. An explicit `validation: false` is the
  // consumer's opt-out and is kept verbatim.
  controller.request = {
    ...controllerRequest,
    validation:
      controllerRequest?.validation === false
        ? false
        : { ...rocketsSchemaValidation, ...controllerRequest?.validation },
  };

  const controllerJoins = buildControllerJoins(relations);

  // Access control is materialised here rather than inside
  // `buildOperation` so the collected `CanAccess` services can travel on
  // the bundle: the planner registers them with `AccessControlModule`,
  // which is the DI scope the upstream guard strict-resolves from.
  const operationQueries: Type<CanAccess>[] = [];
  const aclDecorators: Partial<
    Record<ResourceOperationName, readonly MethodDecorator[]>
  > = {};
  for (const op of operations) {
    const binding = resolveOperationAcl({
      label: op,
      operation: op,
      resourceAcl: acl,
      operationAcl: operationOverrides[op]?.acl,
      resourceKey: key,
      isPublic,
    });
    if (binding.query) operationQueries.push(binding.query);
    const decorators: MethodDecorator[] = [];
    if (binding.grant) decorators.push(binding.grant);
    if (binding.query) {
      decorators.push(
        AccessControlQuery({ service: binding.query }) as MethodDecorator,
      );
    }
    if (decorators.length) aclDecorators[op] = decorators;
  }

  const ops: CrudOperationOptions<PlainLiteralObject>[] = operations.map((op) =>
    buildOperation(op, {
      dto,
      joins: controllerJoins,
      handlers,
      override: withAclDecorators(operationOverrides[op], aclDecorators[op]),
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
        parentPersistenceModule: repository,
        parentHooks: hooks,
        parentPrimaryParam: primaryParamName(controllerRequest),
        segment,
        sub,
      });
      subResourceBundles.push(subBundle);
    }
  }

  const aclPlan = buildAclPlan({
    resourceKey: key,
    isPublic,
    resourceAcl: acl,
    operations,
    operationAcls: Object.fromEntries(
      operations.map((op) => [op, operationOverrides[op]?.acl]),
    ),
    operationQueries,
  });

  const bundle: CrudResource<E> = {
    kind: ResourceKind.Crud,
    acl: aclPlan,
    core,
    persistence: {
      ...(repository ? { module: repository } : {}),
      entity: entityOptions,
    },
    meta: {
      key,
      entityClass: entity,
      relations: relations ?? [],
      hooks: collectResourceHooks(hooks, operations, operationOverrides),
    },
    ...(subResourceBundles.length ? { subResources: subResourceBundles } : {}),
  };

  return bundle;
}

/**
 * Every hook class this resource wires, de-duplicated: the resource-level
 * `hooks` (registered as providers AND applied as a class-level
 * `@UseHooks`) plus each `operations[op].hooks` override (applied as a
 * method-level `@UseHooks`).
 *
 * Collected here rather than recovered from `core.providers` at plan time
 * for two reasons: per-operation hooks never reach `mergeProviders`, and a
 * provider list cannot be told apart from CQRS handlers and consumer
 * providers without guessing. Sub-resources need no special case —
 * `materialiseSubResource` composes its hooks and calls `defineResource`,
 * so the sub-bundle's own `meta.hooks` is populated by this same path.
 */
function collectResourceHooks(
  resourceHooks: readonly Type[] | undefined,
  operations: readonly ResourceOperationName[],
  operationOverrides: Partial<
    Record<ResourceOperationName, InternalOperationOverride>
  >,
): ReadonlyArray<Type> {
  const seen = new Set<Type>();
  for (const hook of resourceHooks ?? []) seen.add(hook);
  for (const op of operations) {
    for (const hook of operationOverrides[op]?.hooks ?? []) seen.add(hook);
  }
  return [...seen];
}

/**
 * Route param name the parent's own routes use for its primary key.
 *
 * Defaults to `'id'` — the shape `defineResource` generates when the
 * consumer declares no `request.params`. A resource that overrides the
 * primary (`request: { params: { code: { field: 'code', primary: true } } }`)
 * has hooks reading `params.code`, so a sub-resource guard that hardcoded
 * `id` would leave those hooks looking at a key that is never set: a
 * scoping hook silently becomes a no-op, which means unscoped.
 */
function primaryParamName(
  request: CrudRequestConfig<PlainLiteralObject> | undefined,
): string {
  const params = request?.params;
  if (!params) return 'id';
  for (const [name, option] of Object.entries(params)) {
    if (option?.primary === true) return name;
  }
  return 'id';
}
