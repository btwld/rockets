/**
 * Extract a resolved CRUD local value from the context by its class key.
 *
 * CRUD locals are resolved by interceptors and stored on `context.locals`
 * as a Map keyed by the local class KEY constant.
 */
export function getLocal<T>(
  context: Record<string, unknown>,
  localClass: { KEY: string },
): T | undefined {
  const locals = context['locals'] as Map<string, unknown> | undefined;
  if (!locals) return undefined;
  return locals.get(localClass.KEY) as T | undefined;
}
