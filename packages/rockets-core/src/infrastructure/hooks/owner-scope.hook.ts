import { Injectable, type PlainLiteralObject, type Type } from '@nestjs/common';
import {
  type RepositoryFindOneOptions,
  type RepositoryFindOptions,
  Where,
} from '@concepta/nestjs-repository';
import { getActor } from '../../utils/get-actor.helper';
import {
  EntityHook,
  type EntityHookContext,
  type OwnedEntity,
  PassthroughEntityHookBase,
} from './entity-hook';

export const DEFAULT_OWNER_COLUMN = 'userId';

/**
 * Reusable repository hook that scopes read/update/delete to rows owned
 * by the current actor.
 *
 * Use {@link OwnerScopeHook.for}<E>() to bind the entity type and (if
 * needed) override the owner column. The factory caches the generated
 * subclass per `(entity, column)` pair so two resources binding the same
 * entity reuse the same provider token.
 *
 * ## Coverage
 *
 * | Operation | Repository call    | Hook fired            |
 * | --------- | ------------------ | --------------------- |
 * | List      | `findAndCount`     | `beforeFindAndCount`  |
 * | Read      | `findOne`          | `beforeFindOne`       |
 * | Update    | `findOne` + update | `beforeFindOne`       |
 * | Delete    | `findOne` + delete | `beforeFindOne`       |
 *
 * Create is NOT scoped here — pair with `OwnerStampHook` to stamp the
 * owner column on writes.
 *
 * ## No-op semantics
 *
 * If the request has no actor, the hook returns options unchanged. The
 * upstream `AuthServerGuard` should have rejected unauthenticated
 * requests on protected routes, so reaching the hook without an actor
 * implies a public route that should not be owner-scoped.
 *
 * @example Default `userId` column on PetEntity:
 * ```ts
 * defineResource({
 *   entity: PetEntity,
 *   hooks: [OwnerScopeHook.for<PetEntity>()],
 *   // ...
 * });
 * ```
 *
 * @example Custom column on BlogPost (`authorId`). The entity must
 * structurally match the column type contract:
 * ```ts
 * interface AuthoredPost { readonly authorId: string }
 * defineResource({
 *   entity: BlogPostEntity,
 *   hooks: [OwnerScopeHook.for<AuthoredPost>('authorId')],
 *   // ...
 * });
 * ```
 */
@EntityHook()
@Injectable()
export class OwnerScopeHook<
  E extends PlainLiteralObject,
> extends PassthroughEntityHookBase<E> {
  protected readonly ownerColumn: keyof E & string =
    DEFAULT_OWNER_COLUMN as keyof E & string;

  override beforeFindAndCount(
    options: RepositoryFindOptions<E>,
    ctx?: EntityHookContext,
  ): RepositoryFindOptions<E> {
    return this.withOwnerFilter(options, ctx);
  }

  override beforeFindOne(
    options: RepositoryFindOneOptions<E>,
    ctx?: EntityHookContext,
  ): RepositoryFindOneOptions<E> {
    return this.withOwnerFilter(options, ctx);
  }

  /**
   * Static factory that binds the entity AND the owner column on a
   * cached named subclass. The entity class is mandatory — it locks the
   * hook's compile-time generic AND drives the `@EntityHook({ entity })`
   * spec that fences the hook off from foreign-entity writes at runtime.
   *
   * Forces a compile-time check that the entity has the column —
   * `<E extends OwnedEntity>` for the default `userId`, or
   * `<E extends { readonly [K]: string }>` for a custom column.
   *
   * The factory caches per `(entityKey, column)` so two resources
   * binding the same pair receive the same NestJS provider token.
   */
  static for<E extends OwnedEntity>(entity: Type<E>): Type<OwnerScopeHook<E>>;
  static for<E extends PlainLiteralObject, C extends keyof E & string>(
    entity: Type<E>,
    column: C & (E[C] extends string ? C : never),
  ): Type<OwnerScopeHook<E>>;
  static for(
    entity: Type<PlainLiteralObject>,
    column: string = DEFAULT_OWNER_COLUMN,
  ): Type<OwnerScopeHook<PlainLiteralObject>> {
    return getOwnerScopeSubclass(entity, column);
  }

  private withOwnerFilter<
    T extends RepositoryFindOptions<E> | RepositoryFindOneOptions<E>,
  >(options: T, ctx?: EntityHookContext): T {
    const actor = getActor(ctx);
    if (!actor?.id) return options;

    const ownerClause = Where.eq<E>(this.ownerColumn, actor.id);
    return {
      ...options,
      where: options.where
        ? Where.and(options.where, ownerClause)
        : ownerClause,
    };
  }
}

/**
 * Registry of generated `OwnerScopeHook` subclasses keyed by
 * `(entityClass, column)`. NestJS DI uses class identity as a token, so
 * every distinct entity+column pair needs a distinct class — but we
 * cache so repeated calls with the same pair reuse the same class (and
 * thus the same provider).
 */
const ownerScopeSubclassCache = new Map<
  Type<PlainLiteralObject>,
  Map<string, Type<OwnerScopeHook<PlainLiteralObject>>>
>();

function getOwnerScopeSubclass(
  entity: Type<PlainLiteralObject>,
  column: string,
): Type<OwnerScopeHook<PlainLiteralObject>> {
  const perEntity =
    ownerScopeSubclassCache.get(entity) ??
    new Map<string, Type<OwnerScopeHook<PlainLiteralObject>>>();
  const existing = perEntity.get(column);
  if (existing) return existing;

  // Named subclass so DI debug output and stack traces show a meaningful
  // class name (e.g. `OwnerScopeHook_Pet_authorId`) rather than a
  // synthetic anonymous constructor.
  const className = `OwnerScopeHook_${entity.name}_${column}`;
  const ctor = {
    [className]: class extends OwnerScopeHook<PlainLiteralObject> {
      protected override readonly ownerColumn: string = column;
    },
  }[className] as Type<OwnerScopeHook<PlainLiteralObject>>;

  // Re-apply @EntityHook({entity}) so the subclass registers with a
  // class-level spec that pins it to the target entity. Without this
  // the subclass would fire on every entity in the same request scope
  // — including writes made by sibling hooks — and silently scope to
  // the wrong rows.
  EntityHook({ entity })(ctor);
  Injectable()(ctor);

  perEntity.set(column, ctor);
  ownerScopeSubclassCache.set(entity, perEntity);
  return ctor;
}
