import { PlainLiteralObject } from '@nestjs/common';
import type { AppContextInterface } from '@concepta/nestjs-common';
import type { CrudContextInterface } from '@bitwild/rockets-crud';
import type { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import { AuthorizedUserCtx } from '../infrastructure/interceptors/authorized-user.overlay';

/**
 * Reads the authenticated user overlay from the CRUD context.
 *
 * The ctx value injected by upstream `@Ctx(CrudCtx)` is produced by
 * `AppContextHost.defineOverlay` via `Object.assign(Object.create(host), values)`
 * where host is the per-request AppContextHost, so the returned props object
 * inherits overlay methods (`with`, `supports`, etc.) via its prototype chain.
 *
 * That means any overlay registered on the same request — including
 * `AuthorizedUserCtx` attached by `AuthorizedUserOverlay` — is reachable from
 * ctx without a reference to the raw HTTP request.
 *
 * The type system does not express this prototype-chain relationship — in
 * `@concepta/*`, `CrudContextInterface` does not extend `AppContextInterface` —
 * so we check for the overlay method at runtime instead of casting. Returns
 * `undefined` when the overlay is not defined (public route not covered by
 * `AuthServerGuard`, or a context shape that doesn't carry the overlay).
 */
export function getAuthorizedUserFromCrudContext<T extends PlainLiteralObject>(
  context: CrudContextInterface<T>,
): AuthorizedUser | undefined {
  if (!hasOverlayAccessor(context)) return undefined;
  return context.with(AuthorizedUserCtx);
}

/**
 * Runtime check that a value exposes the `AppContextInterface.with` overlay
 * accessor. Avoids a type cast in the caller: if the method is not present,
 * the helper returns `undefined` instead of crashing on a property access.
 */
function hasOverlayAccessor(value: unknown): value is AppContextInterface {
  return (
    typeof value === 'object' &&
    value !== null &&
    'with' in value &&
    typeof (value as { with: unknown }).with === 'function'
  );
}
