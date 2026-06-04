import { applyDecorators, type PlainLiteralObject } from '@nestjs/common';
import { deriveEntityKey } from '@bitwild/rockets-app';
import {
  CrudOperationResolver,
  type ConfigurableCrudGeneratedOptions,
  type CrudControllerOptionsInterface,
  type CrudOperationOptions,
} from '@bitwild/rockets-crud';
import type { RepositoryProviderOptions } from '@bitwild/rockets-repository';
import type { RocketsResourceConfig } from '../../../domain/interfaces/rockets-resource.interface';
import type { RocketsResourceDefinition } from '../../../domain/interfaces/rockets-resource-definition.interface';
import type { CrudResource } from '../../../domain/interfaces/rockets-resource-bundle.interface';
import type { RocketsSubResourceDefinition } from '../../../domain/interfaces/rockets-resource-definition.interface';
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
