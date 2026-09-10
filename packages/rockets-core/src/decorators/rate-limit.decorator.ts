import {
  SetMetadata,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';

/** DI/reflector key for `@RateLimit()` metadata. */
export const ROCKETS_RATE_LIMIT_TOKEN = Symbol.for(
  '@concepta/rockets-core/rate-limit',
);

/** DI token for app-wide {@link RateLimitDefaults}. */
export const RATE_LIMIT_DEFAULTS_TOKEN = Symbol.for(
  '@concepta/rockets-core/rate-limit-defaults',
);

/** The dimension a flat `@RateLimit({ limit, windowMs })` writes to. */
export const DEFAULT_RATE_LIMIT_DIMENSION = 'default';

export interface RateLimitOptions {
  /** Requests allowed per window. */
  readonly limit: number;
  readonly windowMs: number;
  /**
   * Resolves the counter key from the request. Defaults to
   * `ip:METHOD:route` — override for per-user, per-API-key, or
   * per-tenant limiting.
   *
   * Returning SEVERAL keys counts the attempt against each of them
   * independently, all under this dimension's own limit. That is what a
   * key built from a client-chosen field needs: a login body naming
   * `username` also accepts an unknown `email`, and a single key that
   * prefers one field lets the other be rotated per request to mint a
   * fresh counter. One key per field it could have meant keeps the
   * counter for the field the route actually authenticates with.
   */
  readonly key?: (context: ExecutionContext) => string | readonly string[];
}

/**
 * Named limits enforced **together**: a request must be within every
 * dimension, and each counts against its own key.
 *
 * One limit cannot express the shape a login route needs. Keyed on the
 * account alone, an attacker locks a victim out by naming their
 * username; keyed on the IP alone, the limit collapses behind a load
 * balancer. Keying on the `(ip, account)` pair fixes both — and then
 * leaves a second hole, because rotating the account field from one
 * source resets that counter on every attempt. A coarse per-IP ceiling
 * alongside it is what closes that, and it only works if the two are
 * separate counters applied at once.
 */
export type RateLimitPolicy = Readonly<
  Record<string, RateLimitDimensionOverride>
>;

/**
 * A dimension as a ROUTE writes it: EITHER the whole thing, OR a `key`
 * on its own — the one partial the merge actually needs (keep the
 * app-wide `limit` / `windowMs`, swap what the counter is keyed on, which
 * is how `/signup` names the account fields it authenticates with).
 *
 * Deliberately not `Partial<RateLimitOptions>`. That admits three more
 * shapes — `{ limit }`, `{ windowMs }`, `{}` — and every one of them
 * describes a dimension the author cannot complete: nothing in the type
 * system can see whether an app-wide default supplies the other half, so
 * the mistake would only surface as a throw on the first request to that
 * route. The union puts those three back on the compiler.
 *
 * One case stays runtime-only, and the guard still throws for it: a
 * key-only override naming a dimension NO `RATE_LIMIT_DEFAULTS_TOKEN`
 * registers (`@RateLimit({ tenant: { key } })` in an app whose defaults
 * declare `ip` and `default`). The dimension name is an author-chosen
 * string with no closed set, so the type cannot know it.
 */
export type RateLimitDimensionOverride =
  | RateLimitOptions
  | {
      readonly key: NonNullable<RateLimitOptions['key']>;
      readonly limit?: never;
      readonly windowMs?: never;
    };

/**
 * App-wide dimensions, provided under {@link RATE_LIMIT_DEFAULTS_TOKEN}.
 *
 * A route's own `@RateLimit()` overrides a dimension **by name** and
 * leaves the rest in place. That is the whole point of the split: a
 * route tightening its `default` limit cannot raise — or drop — the
 * ceiling it was meant to sit under.
 */
export interface RateLimitDefaults {
  /** Turns the guard into a no-op everywhere. */
  readonly disabled?: boolean;
  /**
   * COMPLETE dimensions, not overrides: this is the base a route's
   * `@RateLimit` merges onto, so a half-declared one here has nothing to
   * fall back to.
   */
  readonly dimensions?: Readonly<Record<string, RateLimitOptions>>;
}

function isFlat(
  options: RateLimitOptions | RateLimitPolicy,
): options is RateLimitOptions {
  return typeof (options as RateLimitOptions).limit === 'number';
}

/**
 * Declares rate limits on a route (or, applied to a controller, every
 * route on it) — issue #56. `RateLimitGuard` is a no-op on any route
 * with no limits at all, so registering the guard globally does not
 * change behavior for routes that never opt in.
 *
 * @example Single limit — sugar for the `default` dimension.
 * ```ts
 * @RateLimit({ limit: 10, windowMs: 60_000 })
 * @Post('login')
 * login(@Body({ schema }) body: LoginBody) { … }
 * ```
 *
 * @example Overriding one dimension of an app-wide policy.
 * ```ts
 * // The `ip` ceiling registered under RATE_LIMIT_DEFAULTS_TOKEN still
 * // applies; only `default` is tightened here.
 * @RateLimit({ default: { limit: 5, windowMs: 60_000 } })
 * ```
 */
export function RateLimit(
  options: RateLimitOptions | RateLimitPolicy,
): CustomDecorator<typeof ROCKETS_RATE_LIMIT_TOKEN> {
  const policy: RateLimitPolicy = isFlat(options)
    ? { [DEFAULT_RATE_LIMIT_DIMENSION]: options }
    : options;
  return SetMetadata(ROCKETS_RATE_LIMIT_TOKEN, policy);
}
