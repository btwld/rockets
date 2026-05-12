import {
  Injectable,
  type PlainLiteralObject,
  type Type,
  UnauthorizedException,
} from '@nestjs/common';
import { getActor } from '../../utils/get-actor.helper';
import {
  EntityHook,
  type EntityHookContext,
  type OwnedEntity,
  PassthroughEntityHookBase,
} from './entity-hook';
import { DEFAULT_OWNER_COLUMN } from './owner-scope.hook';

/**
 * Reusable repository hook that stamps the owner column from the current
 * actor on `Create` and `Update`. The actor is treated as the source of
 * truth: any client-supplied value for the owner column is silently
 * overwritten with `actor.id`, so spoofing another user is impossible.
 *
 * Use {@link OwnerStampHook.for}<E>() to bind the entity type and (if
 * needed) override the owner column.
 *
 * Pair with `OwnerScopeHook` to fully replace per-resource handler
 * overrides whose only responsibility was injecting `userId` from the
 * JWT.
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
 * ## Why this is not optional like `OwnerScopeHook`
 *
 * `OwnerScopeHook` no-ops on missing actor because public reads can
 * flow through. Writes can never legitimately reach the adapter without
 * an actor when this hook is wired — that means a route was incorrectly
 * marked `AuthPublic`, and we surface the misconfiguration instead of
 * silently writing rows with a missing/blank owner.
 */
@EntityHook()
@Injectable()
export class OwnerStampHook<
  E extends PlainLiteralObject,
> extends PassthroughEntityHookBase<E> {
  protected readonly ownerColumn: keyof E & string =
    DEFAULT_OWNER_COLUMN as keyof E & string;

  override beforeCreate(payload: E, ctx?: EntityHookContext): E {
    return this.stamp(payload, ctx);
  }

  override beforeUpdate(payload: E, ctx?: EntityHookContext): E {
    return this.stamp(payload, ctx);
  }

  /**
   * Static factory that binds the entity AND the owner column on a
   * cached named subclass. Same caching semantics as
   * {@link OwnerScopeHook.for}. The entity is mandatory because the
   * resulting subclass is decorated with `@EntityHook({ entity })` to
   * fence the hook off from foreign-entity writes.
   */
  static for<E extends OwnedEntity>(entity: Type<E>): Type<OwnerStampHook<E>>;
  static for<E extends PlainLiteralObject, C extends keyof E & string>(
    entity: Type<E>,
    column: C & (E[C] extends string ? C : never),
  ): Type<OwnerStampHook<E>>;
  static for(
    entity: Type<PlainLiteralObject>,
    column: string = DEFAULT_OWNER_COLUMN,
  ): Type<OwnerStampHook<PlainLiteralObject>> {
    return getOwnerStampSubclass(entity, column);
  }

  private stamp(payload: E, ctx?: EntityHookContext): E {
    const actor = getActor(ctx);
    if (!actor?.id) {
      throw new UnauthorizedException(
        `${this.ownerColumn} stamping requires an authenticated actor`,
      );
    }

    // Mutate in-place: the upstream `BeforeCreate` / `BeforeUpdate`
    // membrane uses a `preserve` merge strategy where the original
    // payload wins over any object returned by the hook. Returning a
    // new object with the stamped column would be silently discarded.
    // Any client-supplied value for `ownerColumn` is overwritten by the
    // actor's id.
    //
    // The runtime column name is opaque to TS (it can be any `string`
    // when bound via `OwnerStampHook.for<E>(column)`), so the indexed
    // assignment goes through a `Record<string, unknown>` view rather
    // than `payload[keyof E]`. The compile-time check that `column`
    // names a `string` field on `E` lives in `OwnerStampHook.for()`
    // overload signatures.
    const indexed: Record<string, unknown> = payload;
    indexed[this.ownerColumn] = actor.id;
    return payload;
  }
}

const ownerStampSubclassCache = new Map<
  Type<PlainLiteralObject>,
  Map<string, Type<OwnerStampHook<PlainLiteralObject>>>
>();

function getOwnerStampSubclass(
  entity: Type<PlainLiteralObject>,
  column: string,
): Type<OwnerStampHook<PlainLiteralObject>> {
  const perEntity =
    ownerStampSubclassCache.get(entity) ??
    new Map<string, Type<OwnerStampHook<PlainLiteralObject>>>();
  const existing = perEntity.get(column);
  if (existing) return existing;

  const className = `OwnerStampHook_${entity.name}_${column}`;
  const ctor = {
    [className]: class extends OwnerStampHook<PlainLiteralObject> {
      protected override readonly ownerColumn: string = column;
    },
  }[className] as Type<OwnerStampHook<PlainLiteralObject>>;

  EntityHook({ entity })(ctor);
  Injectable()(ctor);

  perEntity.set(column, ctor);
  ownerStampSubclassCache.set(entity, perEntity);
  return ctor;
}
