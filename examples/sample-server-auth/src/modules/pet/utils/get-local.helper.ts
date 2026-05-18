/**
 * Extract a resolved CRUD local value from the context by its class key.
 *
 * v8 `nestjs-crud` `CrudLocalsInterceptor` stores resolved locals on the
 * context via `Object.defineProperty(ctx, 'withLocal', { value: fn })` —
 * accessed as `ctx.withLocal(LocalClass)`. The earlier `ctx.locals` Map
 * never existed in v8 and silently returned `undefined`, which is why
 * `PetCreateHandler` was throwing `UnauthorizedException` on every request
 * (`authUser` was always undefined).
 */
export function getLocal<T>(
  context: Record<string, unknown>,
  localClass: { KEY: string },
): T | undefined {
  const withLocal = (context as { withLocal?: (cls: { KEY: string }) => T })
    .withLocal;
  if (typeof withLocal !== 'function') return undefined;
  return withLocal.call(context, localClass);
}
