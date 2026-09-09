import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';

/**
 * Longest account value that goes into a counter key verbatim; anything
 * longer is replaced by a hash of itself.
 *
 * Guards run BEFORE pipes, so this value is whatever the client sent,
 * bounded only by the body parser (100 kB by default). Without this an
 * attacker inserts one multi-kilobyte store key per request — and every
 * request does, because a fresh account value is a fresh key, so the
 * per-IP ceiling admits 1000 of them a minute before rejecting anything.
 * Hashing keeps the key bounded while staying 1:1 with the input, so two
 * different long values still get separate counters.
 */
const MAX_ACCOUNT_KEY_LENGTH = 128;

interface NativeRequest {
  readonly ip?: string;
  readonly body?: unknown;
  readonly method?: string;
  readonly route?: { readonly path?: string };
  readonly originalUrl?: string;
}

/**
 * Counters are PER ROUTE, matching the engine this replaces: throttler
 * derived its storage key from the controller/handler pair plus the
 * tracker, so `/token/password` and `/otp` never shared a bucket. A
 * global counter would let ten failed logins consume the OTP route's
 * much smaller allowance.
 */
function routeScope(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<NativeRequest>();
  const method = request.method ?? 'GET';
  const route = request.route?.path ?? request.originalUrl ?? 'unknown';
  return `${method}:${route}`;
}

function requestIp(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<NativeRequest>();
  // The same `request.ip` Express resolves respecting
  // `app.set('trust proxy', ...)` — Rockets does not interpret forwarded
  // headers on the app's behalf (CONFIGURATION.md §7).
  return typeof request.ip === 'string' && request.ip.length > 0
    ? request.ip
    : 'unknown';
}

/**
 * Coarse per-IP counter key — the volume ceiling dimension, and the
 * DEFAULT for the fine dimension too. A route only moves off it by
 * naming the body fields it authenticates with
 * ({@link authAccountRateLimitKey}), so a route that declares nothing is
 * limited per IP rather than per whatever field a client chose to send.
 */
export function authIpRateLimitKey(context: ExecutionContext): string {
  return `${routeScope(context)}:${requestIp(context)}`;
}

/**
 * Per-USER counter key, for a route behind an authentication guard.
 *
 * `@UseGuards(JwtGuard, RateLimitGuard)` runs the auth guard first, so
 * `request.user` is populated by the time the limiter reads it — and the
 * authenticated id is a better key than the IP on such a route: five
 * password changes a minute keyed per IP is one office behind a NAT
 * locking itself out, which is the same lockout the composite account key
 * exists to prevent. Falls back to the IP when there is no actor, so a
 * misordered guard chain limits rather than opens.
 */
export function authUserRateLimitKey(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest<NativeRequest>();
  const actor: unknown = Reflect.get(request, 'user');
  const id =
    typeof actor === 'object' && actor !== null
      ? Reflect.get(actor, 'id')
      : undefined;
  return typeof id === 'string' && id.length > 0
    ? `${routeScope(context)}:user:${id}`
    : `${routeScope(context)}:${requestIp(context)}`;
}

/**
 * Rate-limits on the IP **and** the targeted account combined, not one or
 * the other. Keying on the account alone lets one attacker lock a victim
 * out of login by naming their username; keying on IP alone misses
 * distributed attacks and collapses behind a load balancer. The composite
 * key limits the `(ip, account)` pair, so an attacker only ever throttles
 * themselves.
 *
 * `fields` is the account fields THIS ROUTE authenticates with — one
 * counter per field present, and the plain IP key when the request names
 * none of them. Declaring them per route is what makes the limit hold:
 * guards run before pipes, so the body still carries keys the route's
 * schema strips, and a key function reading a global field list let a
 * decoy `email` on a `{ username, password }` login body mint a fresh
 * counter per request — the 10/min per-account limit never saw two
 * attempts against the same username. A route that names no field keeps
 * the IP key, so the mistake a new route can make is being limited too
 * coarsely, never not at all.
 *
 * Reads the parsed body — Express body parsing is middleware and has run
 * before guards, which is the same ordering the previous engine's
 * tracker relied on.
 *
 * @example
 * ```ts
 * // `POST /token/password` authenticates `username`; an `email` the
 * // client adds is not one of this route's fields and keys nothing.
 * @RateLimit({
 *   default: { limit: 10, windowMs: 60_000, key: authAccountRateLimitKey(['username']) },
 * })
 * ```
 */
export function authAccountRateLimitKey(
  fields: readonly string[],
): (context: ExecutionContext) => readonly string[] {
  return (context) => {
    const ip = requestIp(context);
    const scope = routeScope(context);
    const request = context.switchToHttp().getRequest<NativeRequest>();
    const body: unknown = request.body;
    const keys: string[] = [];
    if (typeof body === 'object' && body !== null) {
      for (const field of fields) {
        const value = readStringField(body, field);
        // The field name is part of the key: without it the same string
        // sent as `email` and as `username` would share one counter, and
        // one field's traffic would spend the other's allowance.
        if (value !== undefined) {
          keys.push(`${scope}:${ip}::${field}:${boundAccount(value)}`);
        }
      }
    }
    return keys.length > 0 ? keys : [`${scope}:${ip}`];
  };
}

function boundAccount(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.length <= MAX_ACCOUNT_KEY_LENGTH
    ? normalized
    : `h:${createHash('sha256').update(normalized).digest('hex')}`;
}

function readStringField(source: object, key: string): string | undefined {
  const value: unknown = Reflect.get(source, key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
