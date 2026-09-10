import type { PlainLiteralObject, Provider, Type } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import type {
  CrudParamOptionInterface,
  CrudRequestConfig,
} from '@concepta/nestjs-crud';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
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
  /**
   * Parent resource's entity hooks. Handed to `PathScopeGuard` so the
   * parent lookup a nested route performs is filtered by the same hooks
   * the parent's own routes run — a parent hidden by a retention or
   * tenant hook must not be reachable through its children.
   */
  readonly parentHooks: readonly Type[] | undefined;
  /**
   * Route param name carrying the parent's primary key on the parent's
   * OWN routes (`:id` unless the parent declared a different primary in
   * `request.params`). The guard binds it in the replay context so a
   * parent hook reading `params.<primary>` sees the row being looked up.
   */
  readonly parentPrimaryParam: string;
  readonly segment: string;
  readonly sub: RocketsSubResourceDefinition;
}): CrudResource {
  const {
    parentKey,
    parentPath,
    parentTags,
    parentPersistenceModule,
    parentHooks,
    parentPrimaryParam,
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
      // Ancestor params first: at three levels or more the parent path
      // already carries its own `:param`, and the upstream query parser
      // throws (`Error on crud context processing` → 500) on a route
      // param it has no config for. `disabled: true` because only the
      // immediate parent's param is a FK column on this entity — a
      // grandparent's would filter on a column that does not exist.
      // Note the parser gates its whole branch on `disabled !== true`,
      // so a disabled param is neither filtered NOR format-validated;
      // the ancestor's own guard is what checks it.
      ...ancestorParams(parentPath, parentParam),
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
  // and no ownership check.
  const applyScope = sub.scope !== false;

  // The chain guarantee for a grandchild runs through THIS level's
  // `PathScopeHook`: the leaf's guard looks its parent up and replays the
  // parent's hooks, and that hook is the only thing that ties the parent
  // row to `:parentId`. Without it the leaf is reachable through any
  // ancestor id that exists — an access-control hole that opens from a
  // switch two levels up, on a resource whose own routes look correct.
  // Refused at definition time rather than documented: the trade is not
  // one an author can make knowingly here.
  if (!applyScope && Object.keys(def.subResources ?? {}).length > 0) {
    throw new Error(
      `defineResource(${parentKey}): sub-resource "${segment}" sets ` +
        `\`scope: false\` and declares subResources. A nested resource ` +
        `under an unscoped parent cannot verify its ancestor chain — the ` +
        `parent lookup has no FK filter to replay, so a child is readable ` +
        `through any existing grandparent id. Scope this level, or move ` +
        `its children up.`,
    );
  }

  // Ownership guard column. Defaults to `'userId'` (secure by default).
  // `owner: false` and `scope: false` both drop it — but NOT the guard
  // itself: existence and the ancestor chain are verified either way.
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

  // Always attached. Without `ownerColumn` it degrades to an
  // existence + ancestor-chain check, which is correctness rather than
  // an access-control opt-in: at three levels or more route params only
  // filter by the IMMEDIATE parent, so the guard's parent lookup —
  // replaying the parent's own `PathScopeHook` — is the only thing that
  // rejects a middle row addressed through the wrong ancestor.
  const ScopeGuard = PathScopeGuard.for(
    parentParam,
    parentKey,
    ownerColumn,
    sub.parentPk ?? 'id',
    parentHooks ?? [],
    sub.parentSelect,
    parentPrimaryParam,
  );

  const composedDecorators: readonly ClassDecorator[] = [
    ...(ScopeGuard ? [UseGuards(ScopeGuard) as ClassDecorator] : []),
    ...(def.decorators ?? []),
    parentApiParam,
  ];

  const composedProviders: readonly Provider[] = ScopeGuard
    ? [ScopeGuard, ...(def.providers ?? [])]
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

  const bundle = defineResource(materialised);

  // Both scoping classes are handed to `defineResource` as providers; a
  // regression in provider merging would silently unscope the nested
  // route, so assert they survived before publishing the bundle.
  const resolvedProviders = bundle.core.providers ?? [];
  if (ScopeGuard && !resolvedProviders.includes(ScopeGuard)) {
    throw new Error(
      `defineResource(${parentKey}): PathScopeGuard was dropped during ` +
        `sub-resource materialisation for segment "${segment}".`,
    );
  }
  if (ScopeHook && !resolvedProviders.includes(ScopeHook)) {
    throw new Error(
      `defineResource(${parentKey}): PathScopeHook was dropped during ` +
        `sub-resource materialisation for segment "${segment}".`,
    );
  }

  return bundle;
}

/**
 * Route params contributed by ancestors of this sub-resource — every
 * `:name` already present in the parent's path. Empty for a two-level
 * nest, since a top-level parent path carries no params.
 */
function ancestorParams(
  parentPath: string | readonly string[],
  parentParam: string,
): Record<string, CrudParamOptionInterface<PlainLiteralObject>> {
  const paths = Array.isArray(parentPath)
    ? (parentPath as readonly string[])
    : [parentPath as string];

  const params: Record<
    string,
    CrudParamOptionInterface<PlainLiteralObject>
  > = {};
  for (const path of paths) {
    for (const match of path.matchAll(/:([A-Za-z0-9_]+)/g)) {
      const name = match[1];
      if (name === parentParam) continue;
      params[name] = { field: name, type: 'uuid', disabled: true };
    }
  }
  return params;
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
