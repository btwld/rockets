import type {
  RouteAuditEntry,
  RouteAuditReport,
  RoutePolicy,
  RoutePolicyViolation,
} from './route-audit.types';

/**
 * Checks every discovered route against the declared policy.
 *
 * Returns ALL violations rather than throwing on the first: an audit
 * that reveals one problem per boot turns a five-minute fix into five
 * boots, and the whole point is to make the full picture visible at
 * once.
 */
export function evaluateRoutePolicy(
  report: RouteAuditReport,
  policy: RoutePolicy,
): readonly RoutePolicyViolation[] {
  const allowedIds = new Set(policy.allow ?? []);
  const allowedControllers = new Set(policy.allowControllers ?? []);
  const violations: RoutePolicyViolation[] = [];

  // An app with no AUTHENTICATION guard is reported ONCE, before any
  // per-route rule runs, and short-circuits the rest.
  //
  // Both halves matter. Without the short-circuit, `requireAuth`
  // repeats the same app-wide cause on every route and buries it.
  // Without the check running for EVERY rule, `requireAcl` and
  // `requireAclQuery` go silent instead: they gate on
  // `authentication === 'guarded'`, and on an unguarded app no route
  // is, so declaring `requireAcl` alone would boot clean with nothing
  // enforced — this module committing the exact failure it exists to
  // catch.
  const declaredRules = ruleNames(policy);
  if (declaredRules.length > 0 && report.authGuards.length === 0) {
    const guardsNote =
      report.globalGuards.length > 0
        ? `Global guards exist (${report.globalGuards.join(', ')}) but none ` +
          'is recognised as an AUTHENTICATION guard — a throttler or an ' +
          'ACL guard authorises or shapes traffic, it does not establish ' +
          'who the caller is. If an integration-owned guard authenticates ' +
          'this app, list it in `routePolicy.authGuards`. '
        : 'The application registers no global guard, so nothing ' +
          'authenticates any route. ';
    return [
      {
        routeId: '*',
        rule: declaredRules[0],
        detail:
          guardsNote +
          `${declaredRules.join(', ')} cannot be satisfied. If an ` +
          'integration owns the guard (`defineRocketsAuth`, a custom ' +
          'APP_GUARD), its class must be recognised — integrations ' +
          'contribute theirs automatically, anything else goes in ' +
          '`routePolicy.authGuards`. Otherwise compose `@concepta/rockets` ' +
          'or provide APP_GUARD yourself.',
      },
    ];
  }

  // Stale `allow` ids fail the boot: an entry matching no route is
  // either a typo or a leftover from a removed route, and a list that
  // rots silently stops meaning anything. Two deliberate limits:
  // `allowControllers` is not staleness-checked (a class can be
  // conditionally composed and legitimately absent), and a policy
  // declaring NO rules polices nothing — recognition-only policies are
  // passive, and aborting a boot over hygiene when nothing is enforced
  // would make the audit the incident. Routes removed conditionally
  // (`disableController`) live in the same options object as the
  // policy: keep the two consistent per environment.
  const idCounts = new Map<string, number>();
  for (const route of report.routes) {
    idCounts.set(route.id, (idCounts.get(route.id) ?? 0) + 1);
  }
  for (const id of declaredRules.length > 0 ? allowedIds : []) {
    // An allow id matching MORE THAN ONE discovered route is ambiguous
    // — version/host qualifiers make distinct wire routes distinct ids,
    // but if two rows still collapse (same method, path, and declared
    // dimensions), a single entry would exempt them all: the
    // silently-widening exemption this design forbids. Fail closed.
    if ((idCounts.get(id) ?? 0) > 1) {
      violations.push({
        routeId: id,
        rule: 'staleAllow',
        detail:
          'this `allow` entry matches MORE THAN ONE discovered route — an ' +
          'exemption must name exactly one. Disambiguate the routes ' +
          '(version/host qualifiers appear in the id when declared) or ' +
          'exempt by class via `allowControllers`.',
      });
      continue;
    }
    if (!idCounts.has(id)) {
      violations.push({
        routeId: id,
        rule: 'staleAllow',
        detail:
          'this `allow` entry matches no discovered route. Remove it, or ' +
          'fix the id — route ids are `METHOD /path` before global prefix ' +
          'and versioning are applied.',
      });
    }
  }

  // A `@AuthSession()` route says "a browser cookie authenticates this,
  // so a cross-site POST carries the credential automatically". The
  // decorator alone enforces NOTHING: `CsrfGuard` is what reads it, and
  // an app can decorate every session route and never register the
  // guard. That combination boots clean and serves forgeable writes.
  //
  // Reported ONCE for the whole app, not per route, for the same reason
  // the missing-auth-guard case above is: the cause is a single missing
  // global guard, and repeating it on 200 session routes buries it. The
  // routes are named in the message so the fix is still locatable.
  if (policy.requireCsrf === true && report.csrfGuards.length === 0) {
    const sessionRoutes = report.routes.filter(
      (route) =>
        route.sessionAuth &&
        !allowedIds.has(route.id) &&
        !allowedControllers.has(route.controllerRef),
    );
    if (sessionRoutes.length > 0) {
      const named = sessionRoutes
        .slice(0, 5)
        .map((route) => route.id)
        .join(', ');
      const rest =
        sessionRoutes.length > 5 ? ` (+${sessionRoutes.length - 5} more)` : '';
      violations.push({
        routeId: '*',
        rule: 'requireCsrf',
        detail:
          `${sessionRoutes.length} route` +
          `${sessionRoutes.length === 1 ? ' is' : 's are'} @AuthSession() ` +
          `— ${named}${rest} — but the application registers no CSRF ` +
          'guard, so the decorator enforces nothing and a cross-site ' +
          'request carries the session cookie by itself. Register ' +
          '`CsrfGuard` GLOBALLY (an APP_GUARD alongside the authentication ' +
          'guard, with `CSRF_GUARD_OPTIONS_TOKEN`); if your own guard does ' +
          'the job, register it globally too and name it in ' +
          '`routePolicy.csrfGuards`. Otherwise drop @AuthSession() from ' +
          'routes that are not cookie-authenticated.',
      });
    }
  }

  for (const route of report.routes) {
    if (
      allowedIds.has(route.id) ||
      allowedControllers.has(route.controllerRef)
    ) {
      continue;
    }

    if (policy.requireAuth === true) {
      violations.push(...authViolations(route));
    }

    // ACL is only meaningful where a caller identity exists, so a route
    // the author deliberately opened is not also asked to authorise.
    const authenticated = route.authentication === 'guarded';

    if (policy.requireAcl === true && authenticated && !route.aclAction) {
      violations.push({
        routeId: route.id,
        rule: 'requireAcl',
        detail:
          `${route.controller}.${route.handler} carries no AccessControlGrant. ` +
          'Upstream returns true for a route with no grant metadata, so this ' +
          'route is authenticated but open. Declare `acl` on the resource, or ' +
          `add "${route.id}" to \`allow\` to record it as deliberate.`,
      });
    }

    if (
      policy.requireAclQuery === true &&
      authenticated &&
      route.aclAction !== null &&
      route.aclQuery === null
    ) {
      violations.push({
        routeId: route.id,
        rule: 'requireAclQuery',
        detail:
          `${route.controller}.${route.handler} grants "${route.aclAction}" but names ` +
          'no CanAccess service, so `own` possession cannot be resolved and the ' +
          'grant widens to every row.',
      });
    }
  }

  return violations;
}

/**
 * Always-on rule, independent of any declared policy: a route parameter
 * that declares a `schema` and is reached by no
 * `StandardSchemaValidationPipe` is documented in OpenAPI and validated
 * by nothing. No app means that, so it is not a policy an app opts into
 * — only its own `allowUnvalidatedSchema` list exempts, for a route
 * validated by a pipe of its own that the audit cannot recognise.
 */
export function schemaPipeViolations(
  report: RouteAuditReport,
  policy: RoutePolicy = {},
): readonly RoutePolicyViolation[] {
  // Only its own list exempts: `allow` / `allowControllers` belong to the
  // policy rules and must not switch this always-on check off as a side
  // effect of exempting a route from `requireAuth`.
  const allowedIds = new Set(policy.allowUnvalidatedSchema ?? []);
  const violations: RoutePolicyViolation[] = [];

  // Same over-broad-match guard as `allow`: an entry matching more than
  // one discovered route would exempt them all from an always-on check.
  const idCounts = new Map<string, number>();
  for (const route of report.routes) {
    idCounts.set(route.id, (idCounts.get(route.id) ?? 0) + 1);
  }
  for (const id of allowedIds) {
    if ((idCounts.get(id) ?? 0) > 1) {
      violations.push({
        routeId: id,
        rule: 'staleAllow',
        detail:
          'this `allowUnvalidatedSchema` entry matches MORE THAN ONE ' +
          'discovered route — an exemption must name exactly one. ' +
          'Disambiguate the routes (version/host qualifiers appear in the ' +
          'id when declared).',
      });
    }
  }

  for (const route of report.routes) {
    if (allowedIds.has(route.id)) continue;
    if (route.unvalidatedCrudBody) {
      violations.push({
        routeId: route.id,
        rule: 'requireSchemaPipe',
        detail:
          `${route.controller}.${route.handler}: generated CRUD body carries ` +
          'no schema, so no StandardSchemaValidationPipe reaches it. Upstream ' +
          'wires the pipe from the OPERATION-level `request.body` only — a ' +
          'controller-level body documents the route and validates nothing. ' +
          'Declare `request.body` on the operation (or list the route in ' +
          '`allowUnvalidatedSchema` if it is validated some other way).',
      });
    }
    if (route.unvalidatedSchemaParams.length === 0) continue;
    const params = route.unvalidatedSchemaParams;
    violations.push({
      routeId: route.id,
      rule: 'requireSchemaPipe',
      detail:
        `${route.controller}.${route.handler}: ${params.join(', ')} ` +
        `declare${params.length === 1 ? 's' : ''} a schema but no ` +
        'StandardSchemaValidationPipe reaches ' +
        `${params.length === 1 ? 'it' : 'them'}. Nest installs no pipe for ` +
        '`schema` — the parameter is documented in OpenAPI and validated by ' +
        'nothing. Add @UsePipes(new StandardSchemaValidationPipe(' +
        'rocketsSchemaValidation)) at class level, or `pipes` on the ' +
        'parameter.',
    });
  }

  return violations;
}

/** Which rules the app actually declared, in reporting order. */
function ruleNames(policy: RoutePolicy): RoutePolicyViolation['rule'][] {
  const names: RoutePolicyViolation['rule'][] = [];
  if (policy.requireAuth === true) names.push('requireAuth');
  if (policy.requireAcl === true) names.push('requireAcl');
  if (policy.requireAclQuery === true) names.push('requireAclQuery');
  if (policy.requireCsrf === true) names.push('requireCsrf');
  return names;
}

/**
 * Per-route auth check. The unguarded-app case never reaches here — it
 * is reported once, app-wide, by `evaluateRoutePolicy`.
 */
function authViolations(route: RouteAuditEntry): RoutePolicyViolation[] {
  if (
    route.authentication === 'public' ||
    route.authentication === 'public-class'
  ) {
    return [
      {
        routeId: route.id,
        rule: 'requireAuth',
        detail:
          `${route.controller}.${route.handler} is AuthPublic` +
          `${
            route.authentication === 'public-class' ? ' at class level' : ''
          }. ` +
          `Add "${route.id}" to \`allow\` if that is intended.`,
      },
    ];
  }

  return [];
}

/** Renders violations as the boot error message. */
export function formatPolicyViolations(
  violations: readonly RoutePolicyViolation[],
): string {
  const lines = violations.map(
    (v) => `  - [${v.rule}] ${v.routeId}: ${v.detail}`,
  );
  return (
    `Rockets route policy rejected ${violations.length} route` +
    `${violations.length === 1 ? '' : 's'}:\n${lines.join('\n')}`
  );
}

/**
 * Always-on rule: a hand-written route that serializes with
 * `@SerializeOptions({ schema })` must strip undeclared keys everywhere
 * in that schema — serialization IS validation for it, so an open object
 * ships whatever the row carries. Generated resources get this check at
 * definition time (`assertFailClosedResponse`); this is the same check
 * for the routes the planner never sees. No exemption: an open response
 * is never validated some other way.
 */
export function openResponseViolations(
  report: RouteAuditReport,
): readonly RoutePolicyViolation[] {
  const violations: RoutePolicyViolation[] = [];
  for (const route of report.routes) {
    if (route.hiddenResponseField) {
      violations.push({
        routeId: route.id,
        rule: 'requireClosedResponse',
        detail:
          `${route.controller}.${route.handler}: @SerializeOptions({ schema }) ` +
          'contains a field declared `dto: { response: false }`. A ' +
          'hand-written response schema is not projected, so the column ' +
          'would reach the wire — drop it with .omit({ field: true }).',
      });
    }
    if (route.openResponseSchema === null) continue;
    violations.push({
      routeId: route.id,
      rule: 'requireClosedResponse',
      detail:
        `${route.controller}.${route.handler}: @SerializeOptions({ schema }) ` +
        `is open at "${route.openResponseSchema}" (.passthrough() / ` +
        '.catchall(), or a pass-through root). Response schemas must ' +
        'strip undeclared keys — declare the keys you want on the wire.',
    });
  }
  return violations;
}
