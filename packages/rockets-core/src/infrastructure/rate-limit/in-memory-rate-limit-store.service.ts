import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import type {
  RateLimitResult,
  RateLimitStoreInterface,
} from '../../domain/interfaces/rate-limit.interface';

interface Window {
  count: number;
  readonly windowStart: number;
  readonly expiresAt: number;
}

/**
 * Hard ceiling on tracked keys. Reached only under abuse: a legitimate
 * app tracks one entry per (dimension, client, route) and expires them
 * continuously.
 */
const DEFAULT_MAX_KEYS = 100_000;

/**
 * Optional DI token overriding {@link DEFAULT_MAX_KEYS}. Provide it when
 * the process has a tighter memory budget than the default assumes.
 */
export const RATE_LIMIT_MAX_KEYS_TOKEN = Symbol.for(
  '@concepta/rockets-core/rate-limit-max-keys',
);

/** Shortest gap between two "dropped a live window" warnings. */
const WARN_INTERVAL_MS = 60_000;

/**
 * In-process reference adapter for {@link RateLimitStoreInterface}
 * (issue #56) — in-memory, single-process, fixed-window. Correct for
 * tests, samples and single-instance deployments; a multi-instance one
 * needs a shared backend (a dynamic-repository table, Redis) behind the
 * same interface — two instances would each track their own count,
 * doubling the effective limit. See `CONFIGURATION.md` §7d.
 *
 * **Why this store evicts, and why that is not an optimisation.** The
 * counter key is derived from the request, and on the routes this store
 * exists to protect — public login, signup, recovery, OTP — part of that
 * key is attacker-supplied (the account field). Guards run BEFORE pipes
 * in Nest, so the value reaching the key function is unvalidated and
 * bounded only by the body-parser limit. A store that never frees an
 * entry therefore turns "requests that were correctly rate-limited" into
 * permanent memory: every rejected attempt still inserts a fresh key, and
 * a coarse per-IP ceiling does not help because each admitted request
 * carries a NEW account value. Unbounded growth inside the policy is the
 * failure mode, not growth from exceeding it.
 *
 * Two bounds, both cheap:
 *
 * - **Least-recently-used order.** Every `consume` re-inserts its key at
 *   the back of the map, so iteration order IS recency order and the
 *   front is the least recently used key. Ordering by expiry instead put
 *   the coarse ceiling key — created on request one of a flood and only
 *   updated since — at the head of the eviction queue: the
 *   account-rotation traffic the ceiling exists to stop was what evicted
 *   the ceiling. A hot key is touched every request, so LRU keeps it.
 * - **A hard key cap.** Eviction drops from the front until the map is
 *   back at `maxKeys` — one entry per request at the cap, never a scan
 *   or a sort of the whole map. Under the flood this bound exists for
 *   that difference is the difference between O(1) and O(n log n) on
 *   every request, on the event loop the app answers requests with.
 *
 * Dropping a LIVE window resets its counter, which raises the effective
 * limit for that key, so it is reported — rate-limited to one message a
 * minute, because at the cap it happens on every request and a per-request
 * `warn` is its own outage.
 *
 * A caller that must never lose a count under abuse wants a shared,
 * persistent store; that is what the port exists for.
 */
@Injectable()
export class InMemoryRateLimitStore implements RateLimitStoreInterface {
  private readonly logger = new Logger(InMemoryRateLimitStore.name);
  private readonly windows = new Map<string, Window>();

  private readonly maxKeys: number;
  private lastWarnAt = 0;
  private droppedLiveSinceWarn = 0;

  // `@Optional() @Inject(token)` rather than a bare defaulted parameter:
  // a plain `maxKeys: number = …` on an `@Injectable()` makes Nest try to
  // resolve `Number` from the container and fail at boot. Direct
  // construction (`new InMemoryRateLimitStore(50)`) still works.
  constructor(
    @Optional()
    @Inject(RATE_LIMIT_MAX_KEYS_TOKEN)
    maxKeys?: number,
  ) {
    // Validated, not defaulted-around: `maxKeys` at zero (or negative, or
    // the `NaN` a `Number(process.env.X)` produces) makes `evict` drop the
    // entry `consume` just inserted, so every request starts a fresh
    // window and the limiter admits everything — a rate limiter turned
    // OFF by a config value, silently. A bad number fails the boot.
    // `Infinity` is refused with the rest: an uncapped in-memory store is
    // the unbounded-growth failure the cap exists for, and asking for it
    // explicitly is more likely a parsed env var than an intent.
    if (maxKeys !== undefined && (!Number.isInteger(maxKeys) || maxKeys < 1)) {
      throw new Error(
        `InMemoryRateLimitStore: maxKeys must be an integer >= 1 (got ` +
          `${String(maxKeys)}). A cap below one evicts every window as it ` +
          `is written, which admits every request.`,
      );
    }
    this.maxKeys = maxKeys ?? DEFAULT_MAX_KEYS;
  }

  /** Tracked keys — for tests and diagnostics. */
  get size(): number {
    return this.windows.size;
  }

  async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const existing = this.windows.get(key);
    const stale =
      existing === undefined || now - existing.windowStart >= windowMs;

    const window: Window = stale
      ? { count: 1, windowStart: now, expiresAt: now + windowMs }
      : {
          count: existing.count + 1,
          windowStart: existing.windowStart,
          expiresAt: existing.windowStart + windowMs,
        };
    // Deleted before it is re-set: a `Map` keeps INSERTION order and an
    // overwrite does not move a key, so without the delete the iteration
    // order stays creation order and eviction would drop the oldest
    // CREATED key — the hot one. With it, iteration order is recency
    // order and `evict` reads the front as least-recently-used.
    this.windows.delete(key);
    this.windows.set(key, window);

    this.evict(now);

    return {
      allowed: window.count <= limit,
      limit,
      remaining: Math.max(0, limit - window.count),
      resetAt: window.windowStart + windowMs,
    };
  }

  private evict(now: number): void {
    if (this.windows.size <= this.maxKeys) {
      // Under the cap: nothing to do. Expired entries are reclaimed in
      // place by the next `consume` for the same key, and by the drop
      // below once the cap is hit — no periodic sweep, so no O(n) work
      // on any request.
      return;
    }

    let droppedLive = 0;
    // Front-first: least recently used, which is where an expired window
    // ends up on its own (nothing touched it since). Deleting during
    // iteration is defined for `Map` — the iterator skips removed entries
    // and keeps going in order. Bounded by the overflow, which is one at
    // the cap.
    for (const [key, window] of this.windows) {
      if (this.windows.size <= this.maxKeys) break;
      if (window.expiresAt > now) droppedLive += 1;
      this.windows.delete(key);
    }

    if (droppedLive > 0) {
      this.reportDroppedLive(droppedLive, now);
    }
  }

  /**
   * Dropping a live window restarts its counter, so it is reported — but
   * at the cap it happens on EVERY request, and a per-request `warn` on
   * the path a flood is already saturating is its own incident. Coalesced
   * into one message a minute carrying the count.
   */
  private reportDroppedLive(dropped: number, now: number): void {
    this.droppedLiveSinceWarn += dropped;
    if (now - this.lastWarnAt < WARN_INTERVAL_MS) {
      return;
    }
    const total = this.droppedLiveSinceWarn;
    this.lastWarnAt = now;
    this.droppedLiveSinceWarn = 0;
    this.logger.warn(
      `Rate-limit key cap (${this.maxKeys}) reached; dropped ${total} live ` +
        `window(s), whose counters restart. This means unique keys are being ` +
        `created faster than they expire — use a shared, persistent store.`,
    );
  }
}
