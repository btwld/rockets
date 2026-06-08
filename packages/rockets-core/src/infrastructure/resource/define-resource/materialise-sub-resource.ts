import type { PlainLiteralObject, Provider } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import type { CrudParamOptionInterface } from '@bitwild/rockets-crud';
import type { CrudRequestConfig } from '@bitwild/rockets-crud';
import type { RepositoryModuleInterface } from '@bitwild/rockets-repository';
import type {
  RocketsResourceDefinition,
  RocketsSubResourceDefinition,
  ResourceOperationsObject,
  ResourceOperationName,
} from '../../../domain/interfaces/rockets-resource-definition.interface';
import type { CrudResource } from '../../../domain/interfaces/rockets-resource-bundle.interface';
import { defaultParentParam } from '../define-sub-resource';
import { PathScopeHook } from '../../hooks/path-scope.hook';
import { PathScopeGuard } from '../../guards/path-scope.guard';
import { AfterCreateReloadHook } from '../../hooks/after-create-reload.hook';
import { defineResource } from './define-resource';

export function materialiseSubResource(args: {
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

  // `parentKey` (arg) is the parent entity's own key; `sub.parentKey`
  // (DSL field) is the parent reference — URL param AND FK column,
  // collapsed into one. Default `${parentEntityKey}Id`.
  const parentParam = sub.parentKey ?? defaultParentParam(parentKey);
  const parentForeignKey = parentParam;

  const urlSegment =
    sub.segment ??
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
  const tags = def.tags ?? parentTags;

  const parentApiParam = ApiParam({
    name: parentParam,
    type: 'string',
    required: true,
    description: `Parent ${parentKey} id (URL path).`,
  });

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

  const composedOperations = composeSubResourceOperationsDecorators(
    def.operations,
    parentApiParam,
    parentKey,
  );

  // Path-scoping master switch. `scope: false` → no FK filter/stamp hook
  // and no ownership guard (fully unscoped nested route).
  const applyScope = sub.scope !== false;

  // Ownership guard column. Defaults to `'userId'` (secure by default).
  // `owner: false` drops the guard while keeping the FK hook. `scope:
  // false` drops both.
  const ownerColumn =
    !applyScope || sub.owner === false ? undefined : sub.owner ?? 'userId';

  const ScopeHook = applyScope
    ? PathScopeHook.for(def.entity, parentParam, parentForeignKey)
    : undefined;

  const ReloadHook = sub.reloadAfterCreate
    ? AfterCreateReloadHook.for(def.entity)
    : undefined;

  const composedHooks = [
    ...(ScopeHook ? [ScopeHook] : []),
    ...(ReloadHook ? [ReloadHook] : []),
    ...(def.hooks ?? []),
  ];

  const ScopeGuard = ownerColumn
    ? PathScopeGuard.for(
        parentParam,
        parentKey,
        ownerColumn,
        sub.parentPk ?? 'id',
      )
    : undefined;

  const composedDecorators: readonly ClassDecorator[] = [
    ...(def.decorators ?? []),
    parentApiParam,
    ...(ScopeGuard ? [UseGuards(ScopeGuard) as ClassDecorator] : []),
  ];

  const composedProviders: readonly Provider[] = ScopeGuard
    ? [...(def.providers ?? []), ScopeGuard]
    : def.providers ?? [];

  const persistenceModule = def.repository ?? parentPersistenceModule;

  const materialised: RocketsResourceDefinition<PlainLiteralObject> = {
    ...def,
    path: composedPath,
    tags,
    hooks: composedHooks,
    providers: composedProviders,
    ...(persistenceModule ? { repository: persistenceModule } : {}),
    operations: composedOperations,
    decorators: composedDecorators,
    request: composedRequest,
  };

  return defineResource(materialised);
}

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
