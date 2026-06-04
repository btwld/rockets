import type { PlainLiteralObject, Provider } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { deriveEntityKey } from '@bitwild/rockets-app';
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

  const parentParam = sub.parentParam ?? defaultParentParam(parentKey);
  const parentForeignKey = sub.parentForeignKey ?? parentParam;

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
  const subKey = def.key ?? deriveEntityKey(def.entity);
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

  const ScopeHook = PathScopeHook.for(
    def.entity,
    parentParam,
    parentForeignKey,
  );

  const ReloadHook = sub.reloadAfterCreate
    ? AfterCreateReloadHook.for(def.entity)
    : undefined;

  const composedHooks = [
    ScopeHook,
    ...(ReloadHook ? [ReloadHook] : []),
    ...(def.hooks ?? []),
  ];

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
