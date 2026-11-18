import type { Type } from '@nestjs/common';
import type { CanAccess } from '@concepta/nestjs-access-control';
import type { ResourceAclPlan } from '../../../domain/interfaces/resource-acl.interface';

export interface AccessControlPlanInput {
  /** ACL summaries from every CRUD and operation bundle. */
  readonly plans: ReadonlyArray<ResourceAclPlan>;
  /** Whether the app configured root `accessControl`. */
  readonly configured: boolean;
  /** Whether the default or a declared replacement ACL guard is configured. */
  readonly guardConfigured: boolean;
  /**
   * Whether every route this planner GENERATES must carry a grant.
   *
   * Scope, precisely: CRUD bundles (including recursively-flattened
   * sub-resources) and operation resources. **Not** checked —
   * `defineModuleResource` controllers, hand-built
   * `RocketsResourceConfig` entries, and controllers owned by other
   * packages (`MeController` in rockets-server, every rockets-server-auth
   * controller). The planner never sees those routes, so a clean report
   * says nothing about them.
   *
   * Off by default. Detecting a hand-written `AccessControl*` entry in a
   * bundle's `decorators` is not possible AT PLAN TIME: the CRUD
   * controller is built downstream, so the metadata does not exist yet
   * and the only way to read it early is to apply the consumer's opaque
   * decorator list a second time. The bootstrap-time `RouteAuditService`
   * sweep closes both that and the scope gap above.
   */
  readonly enforceGrants: boolean;
}

/**
 * Boot-time access-control validation, plus the `CanAccess` services to
 * hand `AccessControlModule.forRoot`.
 *
 * The failure this exists to prevent: an operation reaches production
 * authenticated but ungranted. Upstream's check-access handler returns
 * `true` for any route with no grant metadata
 * (`check-access.handler.js`), so a forgotten decorator is an open route
 * that no test notices.
 */
export function planAccessControl(
  input: AccessControlPlanInput,
): ReadonlyArray<Type<CanAccess>> {
  const { plans, configured, guardConfigured, enforceGrants } = input;

  const declaring = plans.filter((plan) => plan.declared);
  if (declaring.length > 0 && !configured) {
    throw new Error(
      `buildAppRegistrationPlan: ${declaring
        .map((plan) => plan.label)
        .join(', ')} declared \`acl\` but the app configured no root ` +
        '`accessControl`. Add it to `RocketsCoreModule.forRoot({ accessControl })` ' +
        'or drop the resource-level `acl`.',
    );
  }

  const granting = plans.filter((plan) => plan.hasGrants ?? plan.declared);
  if (granting.length > 0 && configured && !guardConfigured) {
    throw new Error(
      `buildAppRegistrationPlan: ${granting
        .map((plan) => plan.label)
        .join(', ')} declared \`acl\` while root \`accessControl.appGuard\` ` +
        'is disabled and `routePolicy.aclGuards` declares no replacement. ' +
        'Restore the default guard by omitting `appGuard`, or register a ' +
        'global authorization guard and list its class in ' +
        '`routePolicy.aclGuards`.',
    );
  }

  if (enforceGrants) {
    if (!configured) {
      throw new Error(
        'buildAppRegistrationPlan: `accessControl.enforceGrants` requires ' +
          'root `accessControl` to be configured.',
      );
    }
    const offenders = plans.filter(
      (plan) => plan.ungrantedOperations.length > 0,
    );
    if (offenders.length > 0) {
      const detail = offenders
        .map((plan) => `${plan.label}: ${plan.ungrantedOperations.join(', ')}`)
        .join('; ');
      throw new Error(
        'buildAppRegistrationPlan: `accessControl.enforceGrants` is on and ' +
          `these authenticated operations carry no grant — ${detail}. ` +
          'Declare `acl` on the resource, or `acl: false` on the operation ' +
          'to record that it is deliberately ungranted. (This check covers ' +
          'generated CRUD and operation routes only — module-resource, ' +
          'manual and package-owned controllers are not visible here.)',
      );
    }
  }

  return [...new Set(plans.flatMap((plan) => [...plan.queryServices]))];
}
