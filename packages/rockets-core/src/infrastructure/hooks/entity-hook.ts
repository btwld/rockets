import type { PlainLiteralObject, Type } from '@nestjs/common';
import {
  AfterCreate,
  AfterDelete,
  AfterFindAndCount,
  AfterFindOne,
  AfterRestore,
  AfterSoftDelete,
  AfterUpdate,
  BeforeCreate,
  BeforeDelete,
  BeforeFindAndCount,
  BeforeFindOne,
  BeforeRestore,
  BeforeSoftDelete,
  BeforeUpdate,
  RepoHook,
  RepoSpec,
  type RepositoryFindOneOptions,
  type RepositoryFindOptions,
} from '@bitwild/rockets-repository';
import { Specification } from '@bitwild/rockets-app';
import type { RocketsCrudContext } from '../../domain/interfaces/rockets-crud-context.interface';
import { deriveEntityKey } from '@bitwild/rockets-common';

/**
 * # When to reach for `EntityHook` vs Guard / Interceptor / Subscriber
 *
 * | Need                                                 | Use                              |
 * | ---------------------------------------------------- | -------------------------------- |
 * | Filter / mutate repository options or payloads       | `EntityHook` (this file)         |
 * | Block an HTTP request (401/403/404)                  | `CanActivate` Guard              |
 * | Transform the HTTP response envelope                 | `NestInterceptor`                |
 * | React to ORM-level events outside the request scope  | TypeORM `EntitySubscriber`       |
 *
 * Hooks fire for **every repository call**, including non-HTTP ones
 * (background jobs, scheduler, internal services). Guards only fire on
 * HTTP requests. If you throw `HttpException` from a hook the upstream
 * membrane wraps it in `ModelQueryException` and the intended status
 * collapses to 500 — use a Guard instead.
 *
 * # The lifecycle keys
 *
 * One method per upstream `@Before*` / `@After*` decorator. Override
 * what you need; the base methods are abstract — every subclass MUST
 * provide an explicit body even for "I don't care" cases (return the
 * input unchanged). This forces explicit intent and prevents silent
 * no-ops from typo'd method names.
 *
 * # Why context is `RocketsCrudContext` (no `<E>` propagation)
 *
 * The CRUD context is shared across all hooks on a request. A single
 * hook may serve multiple resources (e.g. `AuditLogHook`), so binding
 * the context to one entity type would break re-use. Read the actor via
 * `getActor(ctx)`; read CRUD-only fields (`params`, `operation`,
 * `entity`) via `getCrudContext(ctx)`.
 */
export type EntityHookContext = RocketsCrudContext;

/**
 * Maps lifecycle method name → upstream `@Before*`/`@After*` decorator.
 *
 * Every key here is a method on {@link EntityHookBase}. The
 * `@EntityHook()` decorator iterates the subclass's own prototype and
 * stamps the matching upstream decorator on each override. Methods named
 * outside this map (or near-misses like `beforeFindOnce`) trigger a
 * decoration-time error so silent no-ops cannot ship to production.
 */
const LIFECYCLE_DECORATORS = {
  beforeFindOne: BeforeFindOne,
  afterFindOne: AfterFindOne,
  beforeFindAndCount: BeforeFindAndCount,
  afterFindAndCount: AfterFindAndCount,
  beforeCreate: BeforeCreate,
  afterCreate: AfterCreate,
  beforeUpdate: BeforeUpdate,
  afterUpdate: AfterUpdate,
  beforeDelete: BeforeDelete,
  afterDelete: AfterDelete,
  beforeSoftDelete: BeforeSoftDelete,
  afterSoftDelete: AfterSoftDelete,
  beforeRestore: BeforeRestore,
  afterRestore: AfterRestore,
} as const;

export type EntityHookLifecycleKey = keyof typeof LIFECYCLE_DECORATORS;

const LIFECYCLE_KEY_SET: ReadonlySet<string> = new Set(
  Object.keys(LIFECYCLE_DECORATORS),
);

/**
 * One-edit Levenshtein check (insertion, deletion, substitution).
 *
 * Used by {@link EntityHook} at decoration time to surface obvious typos
 * — `afterSoftdelete`, `beforeFindOnce` — that would otherwise install as
 * silent no-ops.
 */
function isOneEditAway(a: string, b: string): boolean {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] !== longer[j]) {
      if (++edits > 1) return false;
      if (shorter.length === longer.length) {
        i++;
        j++;
      } else {
        j++;
      }
    } else {
      i++;
      j++;
    }
  }
  return edits + (longer.length - j) === 1;
}

function findNearMissLifecycleKey(name: string): string | undefined {
  for (const key of LIFECYCLE_KEY_SET) {
    if (isOneEditAway(name, key)) return key;
  }
  return undefined;
}

/**
 * Options accepted by {@link EntityHook}.
 *
 * Passing `entity` binds the hook to a specific table at runtime — the
 * decorator auto-applies a class-level `@Specification(RepoSpec.isEntity(...))`
 * so the hook only fires for repository operations on that entity.
 *
 * Without an entity binding the hook can self-recurse: when the hook
 * writes to another table from inside its own `after*` method, the
 * forwarded CRUD context still carries the parent request's `HooksCtx`
 * and the framework re-invokes the same hook on that nested write.
 * `AuditLogHook` is the canonical example — without scoping, every
 * audit-log insert triggers another audit-log insert until the Node heap
 * is exhausted.
 *
 * Hooks that genuinely span more than one entity (rare) should leave
 * `entity` unset and declare their own spec via `@Specification(...)` or
 * per-method `@AfterCreate(RepoSpec.isEntity(...))` decorators.
 */
export interface EntityHookOptions<
  E extends PlainLiteralObject = PlainLiteralObject,
> {
  readonly entity?: Type<E>;
}

/**
 * Class decorator that turns a subclass of {@link EntityHookBase} into a
 * registered repository hook.
 *
 * Walks the subclass's **own** prototype methods. Any method whose name
 * matches a lifecycle key (`beforeFindOne`, `afterCreate`, …) receives
 * the corresponding upstream method decorator. Inherited abstract no-ops
 * on the base are not stamped, so they don't fire.
 *
 * Throws at decoration time if:
 * - An own method is **near** a lifecycle key but doesn't match exactly
 *   (e.g. `afterSoftdelete` instead of `afterSoftDelete`). Silent typos
 *   are otherwise unrecoverable security bugs (audit row never writes).
 *
 * Apply this once on every subclass — it replaces both `@RepoHook()` and
 * the per-method `@Before*`/`@After*` decorators.
 *
 * @example Pet-scoped hook — only fires on `pet` repository calls.
 * ```ts
 * @EntityHook({ entity: PetEntity })
 * @Injectable()
 * export class PetOwnerScopeHook extends EntityHookBase<PetEntity> {
 *   override beforeFindOne(options, ctx) {
 *     const actor = getActor(ctx);
 *     if (!actor?.id) return options;
 *     return {
 *       ...options,
 *       where: Where.and(options.where, Where.eq('userId', actor.id)),
 *     };
 *   }
 * }
 * ```
 */
export function EntityHook<E extends PlainLiteralObject = PlainLiteralObject>(
  options?: EntityHookOptions<E>,
): ClassDecorator {
  return (target) => {
    // `target` is typed `Function` by `ClassDecorator`. The two reads we
    // need (`name`, `prototype`) are declared on `Function`, but the
    // prototype is keyed by arbitrary strings — narrow once at the top
    // through a `Record<string, unknown>` view rather than per-line casts.
    const className = target.name || 'EntityHook';
    const prototype: Record<string, unknown> = target.prototype;

    // 1. Validate own-prototype method names. Catches case-typo and
    //    near-miss bugs (`afterSoftdelete`, `beforeFindOnce`) that would
    //    otherwise install as silent no-ops.
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (!descriptor || typeof descriptor.value !== 'function') continue;
      if (LIFECYCLE_KEY_SET.has(name)) continue;

      const nearMiss = findNearMissLifecycleKey(name);
      if (nearMiss) {
        throw new Error(
          `@EntityHook() ${className}.${name}: method name looks like a typo of "${nearMiss}". ` +
            `Rename to "${nearMiss}" or move this method off the hook class — ` +
            `near-miss names would otherwise install as silent no-ops.`,
        );
      }
    }

    // 2. Stamp method-level lifecycle metadata on overrides. Iterating own
    //    prototype keys (NOT the chain) ensures the abstract base methods
    //    stay metadata-free and are never registered as hooks.
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor') continue;
      const lifecycleKey = name as EntityHookLifecycleKey;
      const decorator = LIFECYCLE_DECORATORS[lifecycleKey];
      if (!decorator) continue;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (!descriptor || typeof descriptor.value !== 'function') continue;

      const methodDecorator = decorator() as MethodDecorator;
      methodDecorator(prototype, name, descriptor);
    }

    // 3. Bind class-level entity scope when `options.entity` is supplied.
    //    `scanHookMethods()` reads `SPECIFICATION_METADATA_KEY` from the
    //    class as the fallback `classSpec` for every lifecycle method, so
    //    the spec applied here is what the hook resolver consults at
    //    runtime — guaranteeing the hook never fires on writes targeted
    //    at a different entity (and therefore never self-recurses).
    //    MUST run before `RepoHook()(target)` because the latter calls
    //    `scanHookMethods()` which captures the class spec.
    if (options?.entity) {
      const entityKey = deriveEntityKey(options.entity);
      Specification(RepoSpec.isEntity(entityKey))(target);
    }

    // 4. Class-level registration. `RepoHook()` runs `scanHookMethods()`
    //    which walks the prototype chain reading the metadata stamped
    //    above, so this MUST run after the loop.
    RepoHook()(target);
  };
}

/**
 * Abstract repository-hook base class.
 *
 * Every lifecycle method is `abstract` — subclasses must provide a body
 * for the methods they care about and explicitly skip the rest. There
 * is no inherited no-op fallback; this is deliberate, because a typo in
 * an override (`afterSoftdelete` for `afterSoftDelete`) would otherwise
 * leave the base no-op firing and the subclass code never running. Pair
 * with {@link passthroughEntityHook} when a subclass needs explicit
 * "I don't care" defaults for the unused lifecycle keys.
 *
 * The generic `E` is propagated to option/payload arguments so consumers
 * get autocomplete on `where` clauses and stamped fields. The hook
 * **class** cannot be parameterised at use-site (`Hook<Pet>` is a type,
 * not a value); per-resource bindings ship as named subclasses or via
 * the `for<E>()` static factory pattern (see `OwnerScopeHook.for<E>()`).
 */
export abstract class EntityHookBase<E extends PlainLiteralObject> {
  // ---------- Read lifecycle ----------

  abstract beforeFindOne(
    options: RepositoryFindOneOptions<E>,
    ctx?: EntityHookContext,
  ): RepositoryFindOneOptions<E> | Promise<RepositoryFindOneOptions<E>>;

  abstract afterFindOne(
    entity: E | null,
    ctx?: EntityHookContext,
  ): (E | null) | Promise<E | null>;

  abstract beforeFindAndCount(
    options: RepositoryFindOptions<E>,
    ctx?: EntityHookContext,
  ): RepositoryFindOptions<E> | Promise<RepositoryFindOptions<E>>;

  abstract afterFindAndCount(
    result: { data: E[]; total: number },
    ctx?: EntityHookContext,
  ): { data: E[]; total: number } | Promise<{ data: E[]; total: number }>;

  // ---------- Write lifecycle ----------

  abstract beforeCreate(payload: E, ctx?: EntityHookContext): E | Promise<E>;

  abstract afterCreate(entity: E, ctx?: EntityHookContext): E | Promise<E>;

  abstract beforeUpdate(payload: E, ctx?: EntityHookContext): E | Promise<E>;

  abstract afterUpdate(entity: E, ctx?: EntityHookContext): E | Promise<E>;

  // ---------- Delete lifecycle ----------

  abstract beforeDelete(entity: E, ctx?: EntityHookContext): E | Promise<E>;
  abstract afterDelete(entity: E, ctx?: EntityHookContext): E | Promise<E>;

  abstract beforeSoftDelete(entity: E, ctx?: EntityHookContext): E | Promise<E>;
  abstract afterSoftDelete(entity: E, ctx?: EntityHookContext): E | Promise<E>;

  abstract beforeRestore(entity: E, ctx?: EntityHookContext): E | Promise<E>;
  abstract afterRestore(entity: E, ctx?: EntityHookContext): E | Promise<E>;
}

/**
 * Mixin/helper class that fills every {@link EntityHookBase} method with
 * a passthrough no-op. Most hooks override only one or two lifecycle
 * methods; extending {@link PassthroughEntityHookBase} avoids forcing
 * each subclass to declare 14 abstract bodies just to skip them.
 *
 * The passthroughs are explicit (one method per key, body returns the
 * input unchanged). Because they are concrete declarations on this
 * class, the `noImplicitOverride` and `override` keyword still apply to
 * subclass overrides — typos like `afterSoftdelete` are caught at the
 * `@EntityHook()` decorator boundary.
 */
export abstract class PassthroughEntityHookBase<
  E extends PlainLiteralObject,
> extends EntityHookBase<E> {
  beforeFindOne(
    options: RepositoryFindOneOptions<E>,
    _ctx?: EntityHookContext,
  ): RepositoryFindOneOptions<E> | Promise<RepositoryFindOneOptions<E>> {
    return options;
  }
  afterFindOne(
    entity: E | null,
    _ctx?: EntityHookContext,
  ): (E | null) | Promise<E | null> {
    return entity;
  }
  beforeFindAndCount(
    options: RepositoryFindOptions<E>,
    _ctx?: EntityHookContext,
  ): RepositoryFindOptions<E> | Promise<RepositoryFindOptions<E>> {
    return options;
  }
  afterFindAndCount(
    result: { data: E[]; total: number },
    _ctx?: EntityHookContext,
  ): { data: E[]; total: number } | Promise<{ data: E[]; total: number }> {
    return result;
  }
  beforeCreate(payload: E, _ctx?: EntityHookContext): E | Promise<E> {
    return payload;
  }
  afterCreate(entity: E, _ctx?: EntityHookContext): E | Promise<E> {
    return entity;
  }
  beforeUpdate(payload: E, _ctx?: EntityHookContext): E | Promise<E> {
    return payload;
  }
  afterUpdate(entity: E, _ctx?: EntityHookContext): E | Promise<E> {
    return entity;
  }
  beforeDelete(entity: E, _ctx?: EntityHookContext): E | Promise<E> {
    return entity;
  }
  afterDelete(entity: E, _ctx?: EntityHookContext): E | Promise<E> {
    return entity;
  }
  beforeSoftDelete(entity: E, _ctx?: EntityHookContext): E | Promise<E> {
    return entity;
  }
  afterSoftDelete(entity: E, _ctx?: EntityHookContext): E | Promise<E> {
    return entity;
  }
  beforeRestore(entity: E, _ctx?: EntityHookContext): E | Promise<E> {
    return entity;
  }
  afterRestore(entity: E, _ctx?: EntityHookContext): E | Promise<E> {
    return entity;
  }
}

/**
 * Marker that an entity carries the conventional `userId` ownership
 * column. Hooks like {@link OwnerScopeHook} constrain their generic entity
 * type to `OwnedEntity` so missing the column surfaces as a compile-time
 * error.
 *
 * For entities with a different ownership column (e.g. `createdBy`,
 * `ownerId`, `authorId`) declare your own marker interface and a
 * dedicated subclass — `OwnedEntity` is intentionally column-specific
 * so the type-level check actually checks something.
 */
export interface OwnedEntity {
  readonly userId: string;
}

/**
 * Nest DI token for a repository hook class used in
 * `defineResource({ hooks })`, `defineSubResource`, and per-operation
 * `hooks` entries.
 *
 * Hooks are bound to **a specific entity** at the type level. A hook
 * declared as `EntityHookBase<PetEntity>` only fits a resource whose
 * `entity: PetEntity`. The previous `<PlainLiteralObject>` escape hatch
 * is gone on purpose — it allowed reusable hooks (audit, indexers) to
 * silently fire on every entity in scope, including their own internal
 * writes, which self-recursed.
 *
 * Reusable hooks must now expose a static `.for(EntityClass)` factory
 * that produces a per-entity subclass decorated with the correct
 * `@EntityHook({ entity })`. Consumers write
 * `hooks: [AuditLogHook.for(PetEntity)]`, locking the entity at the
 * type level AND in runtime.
 *
 * Arbitrary `Type` / plain classes are rejected at compile time — every
 * hook must extend {@link EntityHookBase} or {@link PassthroughEntityHookBase}
 * and be decorated with {@link EntityHook}.
 */
export type RocketsEntityHookForResource<E extends PlainLiteralObject> =
  | Type<EntityHookBase<E>>
  | Type<PassthroughEntityHookBase<E>>;
