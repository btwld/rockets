import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CrudContextOverlay } from '@concepta/nestjs-crud';
import { CrudMetaview } from '../crud-compat';

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
// TODO(upstream: concepta/nestjs-crud) — the upstream master branch has
// already fixed CrudContextOverlay.attach() to no-op on handlers without
// @CrudOperation metadata (commit 5249672f), but the fix is NOT yet
// shipped in the published 8.0.0-alpha.5 we consume. Once a new alpha
// (≥ 8.0.0-alpha.6) ships with this fix and we bump, delete this file,
// delete createSafeCrudRootModule() in rockets-core.module-definition.ts,
// and the bare CrudModule.forRoot({}) will be safe for mixed apps.
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
