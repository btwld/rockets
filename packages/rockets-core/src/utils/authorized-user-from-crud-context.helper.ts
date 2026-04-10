import { PlainLiteralObject } from '@nestjs/common';
import { getAppContext } from '@bitwild/rockets-common';
import type { CrudContextInterface } from '@bitwild/rockets-crud';
import type { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import { AuthorizedUserCtx } from '../infrastructure/interceptors/authorized-user.overlay';

/**
 * Reads the authenticated user from the request-scoped app context overlay
 * (`AuthorizedUserOverlay`), using the HTTP request carried on the CRUD context.
 */
export function getAuthorizedUserFromCrudContext<
  T extends PlainLiteralObject,
>(context: CrudContextInterface<T>): AuthorizedUser | undefined {
  const appCtx = getAppContext(context.httpRequest);
  return appCtx.supports(AuthorizedUserCtx)
    ? appCtx.with(AuthorizedUserCtx)
    : undefined;
}
