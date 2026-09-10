import { Inject, Injectable, Optional, type Type } from '@nestjs/common';
import {
  ApplicationConfig,
  DiscoveryService,
  MetadataScanner,
} from '@nestjs/core';

import { AuthServerGuard } from '../guards/auth-server.guard';
import { CsrfGuard } from '../guards/csrf.guard';
import { collectRouteAudit, type ControllerScan } from './collect-route-audit';
import {
  evaluateRoutePolicy,
  formatPolicyViolations,
  openResponseViolations,
  schemaPipeViolations,
} from './evaluate-route-policy';
import type { RouteAuditReport, RoutePolicy } from './route-audit.types';

export const ROCKETS_ROUTE_POLICY_TOKEN = Symbol('ROCKETS_ROUTE_POLICY');

/**
 * Reports what is actually enforced on every discovered HTTP route, and
 * fails the boot when the declared policy is not met.
 *
 * Runs at bootstrap rather than at plan time on purpose. The planner
 * only sees what it generates; a bootstrap sweep sees every controller
 * Nest assembled — module resources, hand-built configs, and
 * package-owned controllers like `MeController` and every
 * rockets-server-auth route. `validate-access-control.ts` names that gap
 * in its own documentation; this closes it.
 *
 * It also sees decorators the planner cannot: a hand-written
 * `AccessControlGrant` inside a bundle's `decorators: []` exists as real
 * metadata by the time this runs, where at plan time the controller has
 * not been built yet.
 */
@Injectable()
export class RouteAuditService {
  constructor(
    private readonly discoveryService: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly applicationConfig: ApplicationConfig,
    @Optional()
    @Inject(ROCKETS_ROUTE_POLICY_TOKEN)
    private readonly policy?: RoutePolicy,
  ) {}

  /**
   * Two layers. The schema-pipe check is always on — a parameter that
   * declares a schema and is validated by nothing is a defect in any
   * app, so it needs no policy to be declared. The policy rules run only
   * when the app declared one.
   */
  onApplicationBootstrap(): void {
    const report = this.audit();
    const violations = [
      ...schemaPipeViolations(report, this.policy),
      ...openResponseViolations(report),
      ...(this.policy ? evaluateRoutePolicy(report, this.policy) : []),
    ];
    if (violations.length > 0) {
      throw new Error(formatPolicyViolations(violations));
    }
  }

  /**
   * The report itself, for a CI artifact or a diagnostics endpoint.
   *
   * Safe to call without a declared policy — auditing and enforcing are
   * separate so a team can look before it commits to a rule.
   */
  audit(): RouteAuditReport {
    const guards = this.resolveGlobalGuards();
    return collectRouteAudit({
      controllers: this.scanControllers(),
      globalGuards: guards.map((guard) => guard.name),
      authGuards: guards
        .filter((guard) => guard.isAuth)
        .map((guard) => guard.name),
      csrfGuards: guards
        .filter((guard) => guard.isCsrf)
        .map((guard) => guard.name),
    });
  }

  private scanControllers(): ControllerScan[] {
    const scans: ControllerScan[] = [];

    for (const wrapper of this.discoveryService.getControllers()) {
      const controller = wrapper.metatype;
      if (typeof controller !== 'function') continue;

      const prototype: unknown = controller.prototype;
      if (typeof prototype !== 'object' || prototype === null) continue;

      scans.push({
        controller: controller as Type<unknown>,
        methodNames: this.metadataScanner.getAllMethodNames(prototype),
      });
    }

    return scans;
  }

  /**
   * Every global guard, resolved, with an authentication classification.
   *
   * Read from `ApplicationConfig` — public via `@nestjs/core`'s
   * `export * from './application-config.js'` — because it holds what
   * actually runs, where the provider list does not:
   *
   * - `getGlobalGuards()` returns resolved INSTANCES, so a factory that
   *   resolved to `null` disappears with `filter`. Upstream
   *   access-control registers an `APP_GUARD` factory unconditionally
   *   and resolves it to `null` when `appGuard: false`; counting that
   *   wrapper reported an app with zero authentication as guarded.
   * - `getGlobalRequestGuards()` carries request/transient-scoped
   *   guards, which Nest routes to `injectables` — invisible to
   *   `DiscoveryService.getProviders()`. Missing them hard-failed a
   *   correctly guarded app.
   *
   * "Is authentication" is decided by class identity — `AuthServerGuard`
   * or anything in `policy.authGuards` — never by "some guard exists".
   * A throttler or an ACL guard is a global guard that authenticates
   * nothing.
   */
  private resolveGlobalGuards(): Array<{
    readonly name: string;
    readonly isAuth: boolean;
    readonly isCsrf: boolean;
  }> {
    const recognised = this.policy?.authGuards ?? [];
    const recognisedCsrf = this.policy?.csrfGuards ?? [];
    const result: Array<{ name: string; isAuth: boolean; isCsrf: boolean }> =
      [];

    for (const instance of this.applicationConfig.getGlobalGuards()) {
      if (instance === null || instance === undefined) continue;
      const ctor = (instance as object).constructor;
      result.push({
        name: typeof ctor === 'function' && ctor.name ? ctor.name : 'APP_GUARD',
        isAuth:
          instance instanceof AuthServerGuard ||
          recognised.some((type) => instance instanceof type),
        isCsrf:
          instance instanceof CsrfGuard ||
          recognisedCsrf.some((type) => instance instanceof type),
      });
    }

    for (const wrapper of this.applicationConfig.getGlobalRequestGuards()) {
      const metatype: unknown = wrapper.metatype;
      const isClass = typeof metatype === 'function';
      result.push({
        name: isClass && metatype.name ? metatype.name : 'APP_GUARD(request)',
        // Same subclass semantics as the singleton branch: `instanceof`
        // is unavailable without an instance, so walk the prototype
        // chain instead. A factory-built request-scoped guard has no
        // usable metatype and stays unrecognised — fail closed. The
        // `isClass` guard is the runtime fact that makes the `Type`
        // cast safe: `typeof metatype === 'function'` only narrows to
        // `Function`, which cannot express "constructible class".
        isAuth:
          isClass &&
          isOrExtends(metatype as Type<unknown>, [
            AuthServerGuard,
            ...recognised,
          ]),
        isCsrf:
          isClass &&
          isOrExtends(metatype as Type<unknown>, [
            CsrfGuard,
            ...recognisedCsrf,
          ]),
      });
    }

    return result;
  }
}

function isOrExtends(
  candidate: Type<unknown>,
  types: ReadonlyArray<Type<unknown>>,
): boolean {
  return types.some(
    (type) => candidate === type || candidate.prototype instanceof type,
  );
}
