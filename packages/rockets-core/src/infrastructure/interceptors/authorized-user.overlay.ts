import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  ContextOverlayInterceptor,
  getAppContext,
  OverlayRef,
} from '@bitwild/rockets-common';
import type { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';

export const AuthorizedUserCtx = new OverlayRef<
  'withAuthorizedUser',
  AuthorizedUser
>('withAuthorizedUser');

@Injectable()
export class AuthorizedUserOverlay extends ContextOverlayInterceptor {
  readonly ref = AuthorizedUserCtx;

  attach(context: ExecutionContext): void {
    const req = context.switchToHttp().getRequest();

    if (!req.user) return;

    getAppContext(req).defineOverlay(this.ref, req.user);
  }
}
