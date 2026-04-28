import {
  Injectable,
  PlainLiteralObject,
  UnauthorizedException,
} from '@nestjs/common';
import {
  BeforeCreate,
  BeforeUpdate,
  RepoHook,
} from '@bitwild/rockets-repository';
import { getActor } from '../../utils/get-actor.helper';

const DEFAULT_OWNER_COLUMN = 'userId';

/**
 * Reusable repository hook that stamps the owner column from the current
 * actor on `Create` and `Update`. The actor is treated as the source of
 * truth: any client-supplied value for the owner column is silently
 * overwritten with `actor.id`, so spoofing another user is impossible.
 *
 * Pair with `OwnerScopeHook` to fully replace per-resource handler
 * overrides whose only responsibility was injecting `userId` from
 * `request.user`.
 *
 * ## Behavior
 *
 * | Incoming `userId` field | Result                                    |
 * | ----------------------- | ----------------------------------------- |
 * | absent / empty          | stamped with `actor.id`                   |
 * | equals `actor.id`       | passes through unchanged                  |
 * | any other value         | overwritten with `actor.id`               |
 * | no actor in context     | `401 Unauthorized` (write requires actor) |
 *
 * The "any other value" case used to throw `403 Forbidden`, but the
 * upstream `@concepta/nestjs-repository` membrane unconditionally wraps
 * any exception thrown by a hook in `ModelQueryException`, which
 * `CrudQueryException` then collapses to a generic `500`. Until upstream
 * preserves `HttpException`s through the chain, "actor wins" is the only
 * safe declarative behavior.
 *
 * ## Why this is not optional like `OwnerScopeHook`
 *
 * `OwnerScopeHook` no-ops on missing actor because public reads can flow
 * through. Writes can never legitimately reach the adapter without an
 * actor when this hook is wired — that means a route was incorrectly
 * marked `AuthPublic`, and we surface the misconfiguration instead of
 * silently writing rows with a missing/blank owner.
 *
 * ## Custom owner column
 *
 * Subclass and override `ownerColumn`:
 *
 * ```typescript
 * @Injectable()
 * @RepoHook()
 * export class CreatedByStampHook extends OwnerStampHook {
 *   protected readonly ownerColumn = 'createdBy';
 * }
 * ```
 */
@Injectable()
@RepoHook()
export class OwnerStampHook {
  protected readonly ownerColumn: string = DEFAULT_OWNER_COLUMN;

  @BeforeCreate()
  async onCreate<T extends PlainLiteralObject>(
    payload: T,
    ctx?: PlainLiteralObject,
  ): Promise<T> {
    return this.stamp(payload, ctx);
  }

  @BeforeUpdate()
  async onUpdate<T extends PlainLiteralObject>(
    payload: T,
    ctx?: PlainLiteralObject,
  ): Promise<T> {
    return this.stamp(payload, ctx);
  }

  private stamp<T extends PlainLiteralObject>(
    payload: T,
    ctx?: PlainLiteralObject,
  ): T {
    const actor = getActor(ctx);
    if (!actor?.id) {
      throw new UnauthorizedException(
        `${this.ownerColumn} stamping requires an authenticated actor`,
      );
    }

    // Mutate in-place: the upstream `BeforeCreate` / `BeforeUpdate` membrane
    // uses a `preserve` merge strategy where the original payload wins over
    // any object returned by the hook. Returning a new object with the
    // stamped column would be silently discarded. Any client-supplied
    // value for `ownerColumn` is overwritten by the actor's id.
    (payload as PlainLiteralObject)[this.ownerColumn] = actor.id;
    return payload;
  }
}
