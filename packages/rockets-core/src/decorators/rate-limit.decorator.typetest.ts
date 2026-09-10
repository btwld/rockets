import { RateLimit } from './rate-limit.decorator';

/**
 * A route override is EITHER a whole dimension OR a `key` on its own.
 * The three shapes below describe a dimension the author cannot complete
 * — nothing in the type system can see whether an app-wide default
 * supplies the other half — so before this union they compiled and threw
 * on the first request to the route instead.
 *
 * Revert the union in `rate-limit.decorator.ts` and every
 * `@ts-expect-error` here goes unused, which fails this file.
 */
export function rejectedOverrides(): void {
  // @ts-expect-error — `windowMs` is missing and cannot be supplied later.
  RateLimit({ default: { limit: 5 } });
  // @ts-expect-error — `limit` is missing and cannot be supplied later.
  RateLimit({ default: { windowMs: 1_000 } });
  // @ts-expect-error — an empty dimension declares nothing at all.
  RateLimit({ default: {} });
}

/** The shapes the merge actually needs, all of which the repo uses. */
export function acceptedOverrides(): void {
  RateLimit({ limit: 10, windowMs: 60_000 });
  RateLimit({ default: { limit: 10, windowMs: 60_000 } });
  RateLimit({ default: { limit: 10, windowMs: 60_000, key: () => 'k' } });
  // Key-only: keeps the app-wide numbers, swaps what is counted.
  RateLimit({ default: { key: () => ['a', 'b'] } });
  // An empty POLICY opts the controller in with no override at all.
  RateLimit({});
}
