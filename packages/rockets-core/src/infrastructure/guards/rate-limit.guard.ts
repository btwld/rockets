import { createHash } from 'node:crypto';

import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  RATE_LIMIT_DEFAULTS_TOKEN,
  ROCKETS_RATE_LIMIT_TOKEN,
  type RateLimitDefaults,
  type RateLimitDimensionOverride,
  type RateLimitOptions,
  type RateLimitPolicy,
} from '../../decorators/rate-limit.decorator';
import {
  RATE_LIMIT_STORE_TOKEN,
  type RateLimitResult,
  type RateLimitStoreInterface,
} from '../../domain/interfaces/rate-limit.interface';

interface NativeRequest {
  readonly ip?: string;
  readonly method?: string;
  readonly route?: { readonly path?: string };
  readonly originalUrl?: string;
}

interface NativeResponse {
  readonly setHeader?: (name: string, value: string) => unknown;
}

/**
 * Enforces `@RateLimit()` (issue #56) — a no-op on every route that ends
 * up with no dimensions at all, so registering this guard globally does
 * not change behavior for routes that never opt in.
 *
 * Dimensions merge BY NAME, most specific wins per dimension: route
 * handler over controller class over the app-wide
 * `RATE_LIMIT_DEFAULTS_TOKEN` provider. Every merged dimension is then
 * enforced against its own key — a request passes only when all of them
 * allow it. This is what lets a coarse per-IP ceiling coexist with a
 * fine per-`(ip, account)` limit: a route tightening `default` leaves
 * the `ip` ceiling exactly where the app put it.
 *
 * Fails CLOSED: if the store throws (the backing DB/cache is down), the
 * request is rejected with `503`, never let through unlimited — a rate
 * limiter that fails open during exactly the degraded conditions an
 * abuser might be causing defeats its own purpose.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORE_TOKEN)
    private readonly store: RateLimitStoreInterface,
    @Optional()
    @Inject(RATE_LIMIT_DEFAULTS_TOKEN)
    private readonly defaults?: RateLimitDefaults,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.defaults?.disabled === true) {
      return true;
    }

    // Handler and class metadata are read SEPARATELY on purpose:
    // `getAllAndOverride` would let a handler's `{ default: … }` erase a
    // class-level `{ ip: … }` wholesale, where the contract is that a
    // route overrides a dimension by name and inherits the rest.
    const handlerPolicy = this.reflector.get<RateLimitPolicy | undefined>(
      ROCKETS_RATE_LIMIT_TOKEN,
      context.getHandler(),
    );
    const classPolicy = this.reflector.get<RateLimitPolicy | undefined>(
      ROCKETS_RATE_LIMIT_TOKEN,
      context.getClass(),
    );

    // No metadata anywhere on the route: stay a no-op, even when
    // app-wide defaults exist. Opting a route into rate limiting is the
    // decorator's job; the defaults only shape what an opted-in route
    // gets.
    if (handlerPolicy === undefined && classPolicy === undefined) {
      return true;
    }

    // Merged PER FIELD, not per dimension: a route override that only
    // sets `limit`/`windowMs` keeps the dimension's `key`. Replacing the
    // whole dimension object would silently swap an account-composite
    // key for the default per-IP one — the fine limit would then be
    // shared across accounts, which is the lockout shape the composite
    // key exists to prevent.
    const merged: Record<string, RateLimitDimensionOverride> = {};
    for (const policy of [
      this.defaults?.dimensions,
      classPolicy,
      handlerPolicy,
    ]) {
      if (policy === undefined) continue;
      for (const [name, options] of Object.entries(policy)) {
        merged[name] = { ...merged[name], ...options };
      }
    }

    const dimensions = Object.entries(merged);
    if (dimensions.length === 0) {
      return true;
    }

    // A dimension whose key function returns SEVERAL keys counts the
    // attempt against each of them, all under that dimension's own
    // limit. Deduplicated by key so a function that repeats a value does
    // not charge one attempt twice.
    const targets = new Map<string, RateLimitOptions>();
    for (const [name, partial] of dimensions) {
      // A route may override a dimension field by field, so a merged
      // dimension is only enforceable once something supplied both
      // numbers. Rejected loudly rather than consumed with `undefined`,
      // which compares false against every count and 429s the route.
      // The store key is `<dimension>:<key>`, so a `:` in the NAME makes
      // two different dimensions able to produce one string and share a
      // counter. Names are author-chosen and never carry one by accident.
      if (name.includes(':')) {
        throw new Error(
          `Rate limit dimension "${name}" contains ":", which separates ` +
            `the dimension from its key in the store. Rename it.`,
        );
      }
      if (
        typeof partial.limit !== 'number' ||
        typeof partial.windowMs !== 'number'
      ) {
        throw new Error(
          `Rate limit dimension "${name}" has no ${
            typeof partial.limit !== 'number' ? 'limit' : 'windowMs'
          }. A route override merges per field over the app-wide ` +
            `dimension of the same name — declare the missing field on the ` +
            `route, or register the dimension under RATE_LIMIT_DEFAULTS_TOKEN.`,
        );
      }
      const options: RateLimitOptions = {
        limit: partial.limit,
        windowMs: partial.windowMs,
        ...(partial.key ? { key: partial.key } : {}),
      };
      const resolved = options.key
        ? options.key(context)
        : defaultRateLimitKey(context);
      const values =
        typeof resolved === 'string'
          ? [resolved]
          : // NO keys is not a way to skip the limit. A key function that
          // finds nothing to key on ("this request names no account")
          // returning `[]` would contribute no counter, and a dimension
          // with no counter cannot reject — the guard would answer
          // `true` for every such request, which is a rate limiter
          // turned off by an ordinary-looking callback. The route's
          // default key applies instead, so the dimension stays
          // enforced whatever the callback decides.
          resolved.length > 0
          ? resolved
          : [defaultRateLimitKey(context)];
      for (const value of values) {
        targets.set(`${name}:${value}`, options);
      }
    }

    // Consumed sequentially, tightest-first is NOT assumed: every
    // dimension counts this attempt, including ones a later dimension
    // rejects. Counting only up to the first rejection would let an
    // attacker who saturates the coarse ceiling keep the fine counters
    // clean, and the store contract ("no attempt is ever lost") is per
    // dimension.
    let verdict: RateLimitResult | undefined;
    let latestRejectedResetAt = 0;
    for (const [key, options] of targets) {
      let result;
      try {
        result = await this.store.consume(key, options.limit, options.windowMs);
      } catch (error) {
        // The key is NOT logged: it carries the counter's identifying
        // material — the client IP and, on the auth routes, the account
        // the request named. A store outage on a login route would
        // otherwise write every attempted address into the app's log
        // aggregator at error level. The digest is stable, so two
        // failures for the same counter still correlate.
        this.logger.error(
          `Rate limit store failed for key ${digestKey(key)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
          error instanceof Error ? error.stack : undefined,
        );
        throw new ServiceUnavailableException('Rate limiter unavailable');
      }

      if (!result.allowed) {
        latestRejectedResetAt = Math.max(latestRejectedResetAt, result.resetAt);
      }

      // The reported headers describe the MOST CONSTRAINED dimension —
      // the one closest to (or past) its limit — because that is the
      // number a well-behaved client must respect to avoid a 429.
      if (
        verdict === undefined ||
        (!result.allowed && verdict.allowed) ||
        (result.allowed === verdict.allowed &&
          result.remaining < verdict.remaining)
      ) {
        verdict = result;
      }
    }

    if (verdict === undefined) {
      return true;
    }

    // The LATEST reset among the rejected dimensions, not the reported
    // one. Two dimensions can both reject with different windows — both
    // report `remaining: 0`, so the tie-break above picks whichever came
    // first. Advertising that one tells a client blocked for an hour by
    // the `ip` ceiling to retry in 60s, and it just collects another 429.
    // `X-RateLimit-Reset` states the same instant, or the two headers
    // contradict each other on the same response.
    const resetAt = verdict.allowed ? verdict.resetAt : latestRejectedResetAt;

    const response = context.switchToHttp().getResponse<NativeResponse>();
    response.setHeader?.('X-RateLimit-Limit', String(verdict.limit));
    response.setHeader?.('X-RateLimit-Remaining', String(verdict.remaining));
    response.setHeader?.(
      'X-RateLimit-Reset',
      String(Math.ceil(resetAt / 1000)),
    );

    if (!verdict.allowed) {
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((resetAt - Date.now()) / 1000),
      );
      response.setHeader?.('Retry-After', String(retryAfterSeconds));
      throw new HttpException(
        'Too Many Requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}

/**
 * `<dimension>:<8 hex>` — the dimension name (which names no one) plus a
 * digest of the rest, so a store failure is still attributable to one
 * counter without writing an IP or an account address to the log.
 */
function digestKey(key: string): string {
  const separator = key.indexOf(':');
  const dimension = separator === -1 ? key : key.slice(0, separator);
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 8);
  return `${dimension}:${digest}`;
}

/**
 * `ip:METHOD:route`. Same `request.ip` Express resolves respecting
 * `app.set('trust proxy', ...)` that auth throttling already depends on
 * (`CONFIGURATION.md` §7 — a host behind a reverse proxy must configure
 * its own topology; Rockets does not trust forwarded headers on the
 * app's behalf).
 */
function defaultRateLimitKey(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<NativeRequest>();
  const ip = request.ip ?? 'unknown';
  const method = request.method ?? 'GET';
  const route = request.route?.path ?? request.originalUrl ?? 'unknown';
  return `${ip}:${method}:${route}`;
}
