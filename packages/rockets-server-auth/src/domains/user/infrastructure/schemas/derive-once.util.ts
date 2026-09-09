import type { z } from 'zod';

/**
 * One derived schema per input instance. The signup and admin modules both
 * derive the user schemas from the app's userMetadata config, and two
 * distinct instances carrying one OpenAPI component id fail in the
 * document converter — so the derivation is cached per input the way core
 * caches paginated envelopes.
 */
export function deriveOnce<T extends z.ZodType>(
  cache: WeakMap<z.ZodType, T>,
  input: z.ZodType,
  build: () => T,
): T {
  const cached = cache.get(input);
  if (cached !== undefined) return cached;
  const built = build();
  cache.set(input, built);
  return built;
}
