import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CrudContextOverlay, CrudMetaview } from '@bitwild/rockets-crud';

/**
 * Guarded replacement for the upstream `CrudContextOverlay` interceptor.
 *
 * Upstream `CrudModule.forRoot()` registers `CrudContextOverlay` as a
 * global `APP_INTERCEPTOR`. The overlay's `resolve()` unconditionally
 * throws `CrudContextException('No entity defined for ${ControllerName}')`
 * on any handler without `@CrudOperation` metadata — which means every
 * hand-written controller in the same app (auth/signup, /me, any bespoke
 * endpoint) returns `500 CRUD_CONTEXT_ERROR`.
 *
 * `rockets-core` swaps that unsafe global interceptor for this class (see
 * `createSafeCrudRootModule` in `rockets-core.module-definition.ts`). The
 * guard:
 *
 * 1. Reads the `@CrudOperation` metadata via upstream `CrudMetaview`.
 * 2. If present, delegates to `overlay.attach(context)` — identical to
 *    upstream behavior on CRUD routes.
 * 3. If absent, skips `attach` entirely — non-CRUD routes pass through
 *    untouched.
 *
 * This preserves upstream semantics for CRUD controllers while letting
 * mixed-controller apps coexist without a 500.
 */
// TODO(upstream: concepta/nestjs-crud) — CrudContextOverlay.resolve() should
// no-op on handlers without @CrudOperation metadata instead of throwing.
// Once upstream lands that fix, delete this file, delete
// createSafeCrudRootModule() in rockets-core.module-definition.ts, and drop
// the crud-metaview.service deep /dist import below. The bare
// CrudModule.forRoot({}) will then be safe for mixed-controller apps.
@Injectable()
export class SafeCrudContextInterceptor implements NestInterceptor {
  constructor(
    private readonly overlay: CrudContextOverlay,
    private readonly metaview: CrudMetaview,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handler = context.getHandler();
    const operation = this.metaview.getOperation(handler);
    if (operation !== undefined) {
      this.overlay.attach(context);
    }
    return next.handle();
  }
}
