import { ForbiddenException, HttpException, PlainLiteralObject } from '@nestjs/common';
import { CrudAdapter, CrudContextInterface, CrudQueryException } from '@bitwild/rockets-crud';
import {
  getAuthorizedUserFromCrudContext,
  type AuthorizedUser,
} from '@bitwild/rockets-core';

/**
 * Reads the authenticated user off the CRUD context; throws 403 when
 * missing. Fails closed — a public route that reached a mutating handler
 * with no `AuthServerGuard` is a wiring bug, not a feature.
 */
export function requireAuthUser<T extends PlainLiteralObject>(
  context: CrudContextInterface<T>,
  action: string,
): AuthorizedUser {
  const authUser = getAuthorizedUserFromCrudContext(context);
  if (!authUser?.id) {
    throw new ForbiddenException(
      `Authenticated user is required to ${action}`,
    );
  }
  return authUser;
}

/**
 * Wraps the handler's try block: passes HTTP exceptions through (so 4xx
 * routes stay 4xx), rewraps everything else as a `CrudQueryException` so
 * the global exception filter surfaces a consistent error body.
 */
export async function wrapCrudErrors<T>(
  adapter: CrudAdapter<PlainLiteralObject>,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpException) throw e;
    throw new CrudQueryException(adapter.entityName(), {
      originalError: e,
    });
  }
}
