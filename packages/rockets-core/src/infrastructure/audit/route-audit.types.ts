import type { Type } from '@nestjs/common';

/** How a route's authentication resolves, as the guard itself decides it. */
export type RouteAuthState =
  /** No opt-out metadata: the global guard applies. */
  | 'guarded'
  /** `AuthPublic()` on the handler. */
  | 'public'
  /** `AuthPublic({ classLevel: true })` on the controller. */
  | 'public-class'
  /**
   * The app registered no global guard, so nothing authenticates this
   * route whatever its metadata says. Reported separately because the
   * failure is app-wide and a per-route `guarded` would be a lie.
   */
  | 'unguarded-app';

/** One discovered HTTP route and what is actually enforced on it. */
export interface RouteAuditEntry {
  /** `GET /users/:id` — stable id used by `allow` entries. */
  readonly id: string;
  readonly method: string;
  /**
   * Controller path joined with the handler path.
   *
   * Global prefix and Nest versioning are NOT applied: they are resolved
   * by the HTTP adapter after this runs. The id is therefore stable
   * against those settings rather than accurate to the wire path.
   */
  readonly path: string;
  readonly controller: string;
  /**
   * The controller class itself, for identity-based exemption matching.
   * `JSON.stringify` omits function-valued keys, so a serialised report
   * simply has no `controllerRef` — match on `controller` + `id` in a
   * CI artifact; identity matters only in-process.
   */
  readonly controllerRef: Type<unknown>;
  readonly handler: string;
  readonly authentication: RouteAuthState;
  /**
   * Whether `@AuthSession()` marks this route session-cookie
   * authenticated (issue #58's ternary `public | internal | session`
   * policy) — `false` for an "internal" bearer-style route. Orthogonal
   * to `authentication`: a session route is still `guarded` (the normal
   * adapter chain authenticates it); this only reports whether `CsrfGuard`
   * additionally applies to it. `@AuthPublic` and `@AuthSession` on the
   * SAME handler is a contradiction — a public route has no session to
   * protect — and `collectRouteAudit` throws rather than resolve it for
   * you, the same rule `public` + a grant follows in `acl` (#51).
   */
  readonly sessionAuth: boolean;
  /** Action granted by `AccessControlGrant`, or `null` when ungranted. */
  readonly aclAction: string | null;
  /** Resource named by the grant, when the grant declares one. */
  readonly aclResource: string | null;
  /**
   * `CanAccess` service name resolving `own` possession, or `null`.
   * Reports the NEAREST declaration (handler over class); upstream runs
   * every declared service, so a route carrying both is enforced by
   * both while this names one.
   */
  readonly aclQuery: string | null;
  /**
   * Route parameters that declare a Standard Schema
   * (`@Body/@Query/@Param({ schema })`) but reach the handler through no
   * `StandardSchemaValidationPipe` — the parameter's own `pipes`, the
   * handler's and the controller's `@UsePipes` are all checked. Nest adds
   * no implicit pipe for `schema`, so such a parameter is documented in
   * OpenAPI and validated by nothing. Empty on a sound route.
   */
  readonly unvalidatedSchemaParams: readonly string[];
  /**
   * Path of the first OPEN object (`.passthrough()` / `.catchall()`) in
   * the schema a hand-written route serializes with
   * (`@SerializeOptions({ schema })` on the handler or the class), or
   * `null` when the route declares none or it strips everywhere.
   * Serialization IS validation for such a route, so an open object ships
   * whatever the row carries. Generated resources are checked at
   * definition time; this is the same check for the hand-written ones.
   */
  readonly openResponseSchema: string | null;
  /**
   * The schema a hand-written route serializes with
   * (`@SerializeOptions({ schema })`) declares a `dto: { response: false }`
   * field. A hand-written schema is not projected, so the column would
   * reach the wire — the same rule `defineResource` applies at definition
   * time (`assertNoHiddenFields`), checked here for the routes the planner
   * never sees. `false` when the route declares no serializer schema.
   */
  readonly hiddenResponseField: boolean;
  /**
   * A GENERATED CRUD create / update / replace / batch route whose `@Body()`
   * carries no schema. Upstream wires the validation pipe from the
   * OPERATION-level `request.body` only; a body declared at controller
   * level documents the route (the OpenAPI reads the class hierarchy) and
   * validates nothing — invisible to `unvalidatedSchemaParams`, which needs
   * a schema on the parameter to fire. The defect class behind the admin
   * update bodies that shipped unvalidated behind a green suite.
   */
  readonly unvalidatedCrudBody: boolean;
  /**
   * Status codes this route documents with `@ApiResponse({ standardSchema })`
   * while serializing through NO `@SerializeOptions({ schema })`: the
   * document promises a shape nothing enforces. Reported, not enforced —
   * a documentation-only contract is a legitimate choice, but it should be
   * a visible one.
   */
  readonly unserializedResponseSchemas: readonly string[];
}

export interface RouteAuditReport {
  readonly routes: readonly RouteAuditEntry[];
  /** Every resolved global guard (application and request scoped). */
  readonly globalGuards: readonly string[];
  /**
   * The subset recognised as AUTHENTICATION guards — `AuthServerGuard`
   * plus anything listed in `RoutePolicy.authGuards`. This, not
   * `globalGuards`, is what decides `guarded`: an app whose only global
   * guard is a throttler or a disabled ACL factory authenticates
   * nothing.
   */
  readonly authGuards: readonly string[];
  /**
   * The subset recognised as CSRF guards — `CsrfGuard` plus anything
   * listed in `RoutePolicy.csrfGuards`. `requireCsrf` reads this: a
   * `sessionAuth` route in an app that registered no CSRF guard is a
   * cookie-authenticated write with nothing between it and a cross-site
   * form post.
   */
  readonly csrfGuards: readonly string[];
}

/** A single way a route failed the declared policy. */
export interface RoutePolicyViolation {
  readonly routeId: string;
  readonly rule:
    | 'requireAuth'
    | 'requireAcl'
    | 'requireAclQuery'
    | 'requireCsrf'
    | 'requireSchemaPipe'
    | 'requireClosedResponse'
    | 'staleAllow';
  readonly detail: string;
}

/**
 * What the application asserts about EVERY discovered route.
 *
 * Each rule is off by default: turning one on is a statement that the
 * app has finished that work, and the boot failure is what keeps it
 * finished.
 */
export interface RoutePolicy {
  /** Every route must be reached through a guard. */
  readonly requireAuth?: boolean;
  /** Every authenticated route must carry an `AccessControlGrant`. */
  readonly requireAcl?: boolean;
  /** Every granted route must also name a `CanAccess` query service. */
  readonly requireAclQuery?: boolean;
  /**
   * Every `@AuthSession()` route must be covered by a registered CSRF
   * guard.
   *
   * CSRF protection is opt-in through independent doors that all fail
   * OPEN: an app can decorate routes `@AuthSession()` and never register
   * `CsrfGuard`, and nothing anywhere complains — the decorator is inert
   * metadata without a guard reading it. This rule closes the one gap a
   * boot check can close: it fails the boot when a route declares it
   * needs CSRF protection and the app registered nothing that provides
   * it. It does NOT (and cannot) verify the opposite direction — that
   * every route which SHOULD be `@AuthSession()` is decorated. Marking
   * a session route is still the author's call.
   */
  readonly requireCsrf?: boolean;
  /**
   * Route ids exempt from EVERY declared rule, e.g. `['GET /health']`.
   *
   * Deliberately an explicit id list rather than a pattern: an exemption
   * that silently widens as routes are added is the failure this whole
   * audit exists to remove. Two limits to know: an entry exempts the
   * route from all rules, not the one it was added for; and, while at
   * least one rule is declared, an entry matching NO discovered route
   * fails the boot as `staleAllow`, so the list cannot rot where it
   * matters. A recognition-only policy polices nothing, staleness
   * included.
   */
  readonly allow?: readonly string[];
  /**
   * Controllers exempt from every rule, by class.
   *
   * For controllers a consumer does not own — a package's own
   * `MeController`, a health controller from a third party — where
   * listing every route id would drift as that package changes.
   */
  readonly allowControllers?: readonly Type<unknown>[];
  /**
   * Route ids whose `{ schema }` parameters are validated some other way
   * (a consumer-owned pipe that is not a `StandardSchemaValidationPipe`).
   *
   * Its own list on purpose: `allow` / `allowControllers` exempt a route
   * from the POLICY rules it was listed for, and an entry added for
   * `requireAuth` must not silently switch off the always-on
   * `requireSchemaPipe` check as well.
   */
  readonly allowUnvalidatedSchema?: readonly string[];
  /**
   * Guard classes recognised as AUTHENTICATION guards, besides
   * `AuthServerGuard`. Compose-your-own-auth apps (an integration-owned
   * JWT guard, for instance) list theirs here; without it the audit
   * reports the app unguarded, because it refuses to assume that any
   * global guard authenticates. Matched by class identity against
   * resolved instances (`instanceof`) and request-scoped wrappers.
   */
  readonly authGuards?: readonly Type<unknown>[];
  /**
   * Guard classes recognised as CSRF guards, besides `CsrfGuard`. An app
   * enforcing the double-submit check with its own guard lists it here;
   * without it `requireCsrf` reports the app unprotected, because — as
   * with `authGuards` — the audit refuses to assume that an unrecognised
   * global guard does the job. Matched by class identity
   * (`instanceof`) and, for request-scoped wrappers, by prototype chain.
   */
  readonly csrfGuards?: readonly Type<unknown>[];
}
