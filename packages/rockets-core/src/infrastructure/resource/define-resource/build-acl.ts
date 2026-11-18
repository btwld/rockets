import type { Type } from '@nestjs/common';
import { ActionEnum, Operation } from '@concepta/nestjs-core';
import {
  AccessControlGrant,
  type CanAccess,
} from '@concepta/nestjs-access-control';
import type {
  OperationAclConfig,
  ResourceAclAction,
  ResourceAclConfig,
  ResourceAclPlan,
} from '../../../domain/interfaces/resource-acl.interface';
import type { ResourceOperationName } from '../../../domain/interfaces/rockets-resource-definition.interface';
import type { InternalOperationOverride } from './internal-operation.types';

/**
 * Action each CRUD operation implies. `ReadMany` and `ReadOne` are the
 * same grant upstream (`AccessControlReadMany` and `AccessControlReadOne`
 * both emit `ActionEnum.READ`), so there is one row per action rather
 * than one per decorator.
 */
const OPERATION_ACTIONS: Readonly<
  Record<ResourceOperationName, ResourceAclAction>
> = {
  [Operation.List]: 'read',
  [Operation.Read]: 'read',
  [Operation.Create]: 'create',
  [Operation.Update]: 'update',
  [Operation.Replace]: 'update',
  [Operation.Delete]: 'delete',
  [Operation.SoftDelete]: 'delete',
  [Operation.Restore]: 'delete',
};

const ACTION_ENUM: Readonly<Record<ResourceAclAction, ActionEnum>> = {
  create: ActionEnum.CREATE,
  read: ActionEnum.READ,
  update: ActionEnum.UPDATE,
  delete: ActionEnum.DELETE,
};

export interface OperationAclBinding {
  /** Method decorator carrying the grant, or `undefined` when opted out. */
  readonly grant: MethodDecorator | undefined;
  /**
   * The `CanAccess` service for this route: the operation's own when it
   * declared one, otherwise the resource-level default.
   *
   * Resolved per route rather than split across class and method levels
   * on purpose. Upstream merges query metadata with
   * `getAllAndMerge([getClass(), getHandler()])` and then **breaks on
   * the first service that returns `true`**, class-level first — so a
   * class-level default plus a method-level "override" is an OR in which
   * the permissive one wins, and an operation could never tighten. One
   * entry per route is what makes the override real.
   */
  readonly query: Type<CanAccess> | undefined;
}

/**
 * Resolves one operation's grant against the resource-level config.
 *
 * Throws rather than guessing whenever the two disagree: a grant that
 * silently disappears is an authenticated-but-unguarded route, which is
 * the failure this whole surface exists to remove.
 */
export function resolveOperationAcl(args: {
  readonly label: string;
  readonly operation: ResourceOperationName;
  readonly resourceAcl: ResourceAclConfig | undefined;
  readonly operationAcl: OperationAclConfig | undefined;
  readonly resourceKey: string;
  /** Whether the route bypasses authentication. */
  readonly isPublic: boolean;
}): OperationAclBinding {
  const { label, operation, resourceAcl, operationAcl, resourceKey, isPublic } =
    args;

  // A public route carries no authenticated user, so role resolution
  // yields nothing and every grant check fails: the route 403s for
  // everyone. Silently unreachable is worse than a boot failure.
  if (isPublic && resourceAcl !== undefined && operationAcl !== false) {
    throw new Error(
      `defineResource(${resourceKey}): operation "${label}" is public but ` +
        'carries an `acl` grant. A public route has no user to resolve ' +
        'roles from, so the grant can never pass — drop `acl` for this ' +
        'resource, or opt the operation out with `acl: false`.',
    );
  }

  if (operationAcl === false) {
    // No grant AND no query: an ungranted route is unguarded by
    // declaration, and running the resource's `CanAccess` on it anyway
    // would suggest otherwise.
    return { grant: undefined, query: undefined };
  }

  if (operationAcl !== undefined && resourceAcl === undefined) {
    throw new Error(
      `defineResource(${resourceKey}): \`operations.${label}.acl\` needs a ` +
        `resource-level \`acl: { resource }\` — an action has nothing to ` +
        `grant against on its own.`,
    );
  }

  if (resourceAcl === undefined) {
    return { grant: undefined, query: undefined };
  }

  const action =
    operationAcl === undefined
      ? OPERATION_ACTIONS[operation]
      : typeof operationAcl === 'string'
      ? operationAcl
      : operationAcl.action;

  const query =
    typeof operationAcl === 'object' && operationAcl !== null
      ? operationAcl.query ?? resourceAcl.query
      : resourceAcl.query;

  return {
    grant: AccessControlGrant({
      resource: resourceAcl.resource,
      action: ACTION_ENUM[action],
    }) as MethodDecorator,
    query,
  };
}

/**
 * Everything the planner needs from one bundle: the `CanAccess` classes
 * to register, and the authenticated operations left without a grant.
 */
export function buildAclPlan(args: {
  readonly resourceKey: string;
  readonly isPublic: boolean;
  readonly resourceAcl: ResourceAclConfig | undefined;
  readonly operations: readonly ResourceOperationName[];
  readonly operationAcls: Readonly<
    Partial<Record<ResourceOperationName, OperationAclConfig>>
  >;
  readonly operationQueries: readonly Type<CanAccess>[];
}): ResourceAclPlan {
  const {
    resourceKey,
    isPublic,
    resourceAcl,
    operations,
    operationAcls,
    operationQueries,
  } = args;

  // Only what a route actually carries. The resource-level `query` is
  // stamped per route by `resolveOperationAcl`, so it is already in
  // `operationQueries` — unless every operation opted out with
  // `acl: false`, in which case registering it would be dead wiring.
  const queryServices = dedupe(operationQueries);

  // A public resource documents no bearer auth; deny-by-omission is about
  // routes an authenticated user reaches, so it does not apply there.
  const ungrantedOperations =
    isPublic || resourceAcl !== undefined
      ? []
      : operations.filter((op) => operationAcls[op] !== false);

  return {
    queryServices,
    hasGrants:
      resourceAcl !== undefined &&
      operations.some((operation) => operationAcls[operation] !== false),
    ungrantedOperations,
    declared: resourceAcl !== undefined,
    label: resourceKey,
  };
}

function dedupe(services: readonly Type<CanAccess>[]): Type<CanAccess>[] {
  return [...new Set(services)];
}

/**
 * Appends the materialised access-control decorators to an operation
 * override without clobbering the ones the consumer declared.
 */
export function withAclDecorators(
  override: InternalOperationOverride | undefined,
  aclDecorators: readonly MethodDecorator[] | undefined,
): InternalOperationOverride | undefined {
  if (!aclDecorators?.length) return override;
  return {
    ...(override ?? {}),
    extraDecorators: [...(override?.extraDecorators ?? []), ...aclDecorators],
  };
}
