import type { Type } from '@nestjs/common';
import type { CanAccess } from '@concepta/nestjs-access-control';

/**
 * The four actions the `accesscontrol` rules model. Deliberately not a
 * free-form string: a typo in a grant is an OPEN route, and upstream
 * `AccessControlGrant` takes an `ActionEnum`, so nothing wider would
 * survive the round-trip anyway.
 */
export type ResourceAclAction = 'create' | 'read' | 'update' | 'delete';

/**
 * Resource-level access control for a bundle.
 *
 * `resource` is the name used in the app's `acRules`
 * (`acRules.grant(role).resource('pet')`). `query` is the `CanAccess`
 * service that answers ownership questions for `own` possession — the
 * framework registers it with `AccessControlModule` so apps stop
 * forgetting the `queryServices` entry.
 */
export interface ResourceAclConfig {
  /** Name used in the app's `accesscontrol` rules (e.g. `'pet'`). */
  readonly resource: string;
  /** Default `CanAccess` service for this bundle's routes. */
  readonly query?: Type<CanAccess>;
}

/**
 * Per-operation access control.
 *
 * - omitted — inherit the action implied by the operation (CRUD only).
 * - `false` — authenticated, explicitly ungranted. The escape hatch that
 *   keeps deny-by-omission honest: an unguarded route has to be written
 *   down, not merely forgotten.
 * - an action — grant that action against the resource-level name.
 * - an object — the same, with a `CanAccess` override for this route.
 */
export type OperationAclConfig =
  | false
  | ResourceAclAction
  | {
      readonly action: ResourceAclAction;
      readonly query?: Type<CanAccess>;
    };

/**
 * What a bundle hands the planner so access control can be validated and
 * wired once, app-wide.
 *
 * Every field is consumed by `buildAppRegistrationPlan`: `queryServices`
 * are merged into `AccessControlModule.forRoot`, `hasGrants` requires an
 * active authorization guard, `ungrantedOperations` drives the
 * deny-by-omission check, and `label` names the offender in errors.
 */
export interface ResourceAclPlan {
  /** `CanAccess` classes this bundle needs registered. */
  readonly queryServices: ReadonlyArray<Type<CanAccess>>;
  /**
   * Whether at least one generated operation carries grant metadata.
   * Omitted legacy plans are treated conservatively as granting when they
   * declared resource-level ACL.
   */
  readonly hasGrants?: boolean;
  /**
   * Authenticated operations that carry no grant — neither an inherited
   * action nor an explicit `acl: false`. Non-empty only when the bundle
   * opted out somewhere the framework cannot infer an action.
   */
  readonly ungrantedOperations: readonly string[];
  /** Whether the bundle declared resource-level `acl` at all. */
  readonly declared: boolean;
  /** Bundle name used in boot-time error messages. */
  readonly label: string;
}
