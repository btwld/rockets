import { Injectable, PlainLiteralObject } from '@nestjs/common';
import {
  BeforeFindAndCount,
  BeforeFindOne,
  RepoHook,
  RepositoryFindOneOptions,
  RepositoryFindOptions,
  Where,
} from '@bitwild/rockets-repository';
import { getActor } from '../../utils/get-actor.helper';

/**
 * Default owner column. Can be changed by subclassing and overriding
 * `ownerColumn`.
 */
export const DEFAULT_OWNER_COLUMN = 'userId';

/**
 * Reusable repository hook that scopes read/update/delete to rows owned by
 * the current actor.
 *
 * Apply via `@UseHooks(OwnerScopeHook)` on any CRUD resource whose entity
 * has a `userId` column. Register the hook class in `resource.providers`
 * so NestJS can instantiate it.
 *
 * ## Coverage
 *
 * Because the CRUD adapter always calls `findOne` before update/delete via
 * `getOneOrFail`, a single `BeforeFindOne` hook scopes all three
 * operations:
 *
 * | Operation | Repository call    | Hook fired            |
 * | --------- | ------------------ | --------------------- |
 * | List      | `findAndCount`     | `BeforeFindAndCount`  |
 * | Read      | `findOne`          | `BeforeFindOne`       |
 * | Update    | `findOne` + update | `BeforeFindOne`       |
 * | Delete    | `findOne` + delete | `BeforeFindOne`       |
 *
 * Create is NOT scoped by this hook — pair with `OwnerStampHook` to stamp
 * the owner column on writes.
 *
 * ## Requirements
 *
 * 1. `HookModule` must be registered (automatic via `RocketsCoreModule`).
 * 2. The entity must have a column matching `ownerColumn` (default
 *    `'userId'`).
 * 3. An overlay must have published an `Actor` to the context. Under HTTP
 *    this happens automatically via `AuthServerGuard` + `ActorOverlay`.
 *    Outside HTTP (jobs, CLI), the entry point is responsible for
 *    publishing `ActorCtx` before invoking the adapter.
 *
 * ## Custom owner column
 *
 * Subclass and override `ownerColumn` to support entities with a different
 * ownership column (e.g. `createdBy`, `ownerId`):
 *
 * ```typescript
 * @Injectable()
 * @RepoHook()
 * export class CreatedByScopeHook extends OwnerScopeHook {
 *   protected readonly ownerColumn = 'createdBy';
 * }
 * ```
 *
 * ## No-op semantics
 *
 * If the request has no actor, the hook returns options unchanged. The
 * upstream `AuthServerGuard` should have rejected unauthenticated requests
 * on protected routes, so reaching the hook without an actor implies a
 * public route that should not be owner-scoped.
 */
@Injectable()
@RepoHook()
export class OwnerScopeHook {
  protected readonly ownerColumn: string = DEFAULT_OWNER_COLUMN;

  @BeforeFindAndCount()
  async scopeFindAndCount(
    options: RepositoryFindOptions<PlainLiteralObject>,
    ctx?: PlainLiteralObject,
  ): Promise<RepositoryFindOptions<PlainLiteralObject>> {
    return this.withOwnerFilter(options, ctx);
  }

  @BeforeFindOne()
  async scopeFindOne(
    options: RepositoryFindOneOptions<PlainLiteralObject>,
    ctx?: PlainLiteralObject,
  ): Promise<RepositoryFindOneOptions<PlainLiteralObject>> {
    return this.withOwnerFilter(options, ctx);
  }

  private withOwnerFilter<
    T extends
      | RepositoryFindOptions<PlainLiteralObject>
      | RepositoryFindOneOptions<PlainLiteralObject>,
  >(options: T, ctx?: PlainLiteralObject): T {
    const actor = getActor(ctx);
    if (!actor?.id) return options;

    const ownerClause = Where.eq<PlainLiteralObject>(
      this.ownerColumn,
      actor.id,
    );
    return {
      ...options,
      where: options.where
        ? Where.and(options.where, ownerClause)
        : ownerClause,
    };
  }
}
