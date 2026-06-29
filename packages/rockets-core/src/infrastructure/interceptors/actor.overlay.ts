import { ExecutionContext, Injectable } from '@nestjs/common';
import {
  ContextOverlayInterceptor,
  getAppContext,
  OverlayRef,
} from '@concepta/nestjs-core';
import type { Actor } from '../../domain/interfaces/actor.interface';
import type { AuthorizedUser } from '../../domain/interfaces/auth-user.interface';

export const ActorCtx = new OverlayRef<'withActor', Actor>('withActor');

/**
 * Attaches an `Actor` overlay to the per-request `AppContextHost`, reading
 * the authenticated user that `AuthServerGuard` placed on `request.user`.
 *
 * The point of this overlay (vs. consumers reading `httpRequest.user`
 * directly) is that hooks running under a CRUD context get the actor via
 * `ctx.with(ActorCtx)` whether the trigger was an HTTP request, an
 * in-process background job, or a CLI command — provided the entry point
 * defines the overlay. For HTTP, this interceptor handles it automatically.
 */
@Injectable()
export class ActorOverlay extends ContextOverlayInterceptor {
  readonly ref = ActorCtx;

  attach(context: ExecutionContext): void {
    const req = context.switchToHttp().getRequest<{ user?: AuthorizedUser }>();
    const user = req?.user;
    if (!user?.id) return;

    const actor: Actor = { id: user.id, type: 'user' };
    getAppContext(req).defineOverlay(this.ref, actor);
  }
}
