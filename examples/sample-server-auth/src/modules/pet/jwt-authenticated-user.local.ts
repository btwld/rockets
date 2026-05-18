import { ExecutionContext, Injectable } from '@nestjs/common';
import type { CrudContextInterface } from '@bitwild/rockets-crud';
// CrudLocalInterface is not part of the public barrel — deep import required
import type { CrudLocalInterface } from '@concepta/nestjs-crud/dist/infrastructure/interceptors/interfaces/crud-local.interface';

/**
 * Shape of `request.user` after JWT validation ({@link RocketsJwtAuthAdapter}).
 * When unauthenticated, {@link JwtAuthenticatedUserLocal.resolve} returns `id: ''`
 * and empty roles (CRUD locals require a plain object, not `null`).
 */
export interface JwtAuthenticatedUserPayload {
  readonly id: string;
  readonly sub?: string;
  readonly email?: string;
  readonly userRoles: ReadonlyArray<{
    readonly role: { readonly name: string };
  }>;
}

type RequestWithUser = { user?: JwtAuthenticatedUserPayload };

/**
 * CRUD local: exposes the authenticated user on {@link CrudContextInterface.locals}
 * for CQRS handlers (via {@link getLocal}), without AsyncLocalStorage.
 *
 * Declare with {@link UseCrudLocals} on the same routes that need the user.
 */
@Injectable()
export class JwtAuthenticatedUserLocal
  implements CrudLocalInterface<JwtAuthenticatedUserPayload>
{
  public static readonly KEY = 'jwtAuthenticatedUser';

  public async resolve(
    context: ExecutionContext,
    _crudContext: CrudContextInterface,
  ): Promise<JwtAuthenticatedUserPayload> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user;
    if (!user?.id) {
      return { id: '', userRoles: [] };
    }
    return {
      id: user.id,
      sub: user.sub,
      email: user.email,
      userRoles: user.userRoles ?? [],
    };
  }

  public async transform(): Promise<void> {
    // no-op
  }
}
