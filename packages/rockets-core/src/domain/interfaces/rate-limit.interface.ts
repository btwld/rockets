export interface RateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  /** Never negative — clamped at 0 once the limit is exceeded. */
  readonly remaining: number;
  /** Epoch ms when the current window resets and the count returns to 0. */
  readonly resetAt: number;
}

/**
 * Fixed-window rate-limit storage port (issue #56): one policy → route
 * binding apps register once, instead of every serious app writing its
 * own fixed-window store over `@InjectDynamicRepository` +
 * `TransactionScope` (the field report's own words for what was
 * happening in practice).
 *
 * Core ships one adapter, `InMemoryRateLimitStore`, for tests and
 * samples — in-memory, single-process. A production, multi-instance
 * deployment needs a shared backend (a dynamic-repository table, Redis)
 * behind the same interface; `CONFIGURATION.md` §7d documents one, with
 * an e2e that fires 10 concurrent requests at a real database and
 * asserts the admitted/rejected split and the persisted attempt count
 * exactly.
 *
 * Deliberately NOT a decision about what happens on a store failure —
 * `consume` throwing is exactly that failure, and `RateLimitGuard`
 * fails CLOSED on it (rejects the request) rather than letting it
 * through unlimited. A store that wants to fail open must swallow its
 * own errors and return an `allowed: true` result — an explicit choice
 * on the adapter's part, never the guard's default.
 */
export interface RateLimitStoreInterface {
  /**
   * Records one attempt against `key` inside a fixed window of
   * `windowMs` and reports whether this attempt stays within `limit`.
   *
   * **The contract an implementation must meet is that no attempt is
   * ever lost.** Concurrent calls for the same `key` must each be
   * counted; a naive read-increment-write over a shared backend does
   * NOT satisfy this, because two overlapping calls read the same
   * pre-increment value and one of the two increments disappears — the
   * attacker's requests are then invisible to the limiter rather than
   * merely rejected. `CONFIGURATION.md` §7d shows a store that meets it
   * by appending one row per attempt instead of mutating a counter.
   *
   * What the port deliberately does NOT promise is a globally
   * linearizable count. Across instances an attempt may be counted a
   * moment after a concurrent one, so a burst can admit slightly more
   * than `limit` — it must never admit fewer, and must never drop an
   * attempt from the total.
   *
   * Two different `(limit, windowMs)` pairs for the SAME `key` are the
   * caller's contract to keep consistent — the store does not validate
   * that policy stays constant across calls.
   */
  consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult>;
}

/** DI token for a {@link RateLimitStoreInterface} implementation. */
export const RATE_LIMIT_STORE_TOKEN = Symbol.for(
  '@concepta/rockets-core/rate-limit-store',
);
