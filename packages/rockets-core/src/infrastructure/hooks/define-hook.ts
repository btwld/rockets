import { Injectable, type PlainLiteralObject, type Type } from '@nestjs/common';
import {
  InjectDynamicRepository,
  type RepositoryInterface,
  type RepositoryFindOneOptions,
  type RepositoryFindOptions,
} from '@bitwild/rockets-repository';

import { deriveEntityKey } from '@bitwild/rockets-common';

import type { Actor } from '../../domain/interfaces/actor.interface';
import { getActor } from '../../utils/get-actor.helper';
import {
  EntityHook,
  EntityHookBase,
  PassthroughEntityHookBase,
  type EntityHookContext,
} from './entity-hook';

/**
 * Curated toolbox handed to every functional hook. Covers the common
 * needs (the bound entity's repository + the request actor) without the
 * hook author wiring DI by hand. For anything beyond this (injecting an
 * arbitrary service), author a class hook with `@EntityHook` instead —
 * `defineHook` is sugar for the 80% case, not a replacement.
 */
export interface EntityHookTools<E extends PlainLiteralObject> {
  readonly repo: RepositoryInterface<E>;
  readonly actor: Actor | undefined;
}

type Ctx = EntityHookContext | undefined;

/**
 * Lifecycle functions accepted by {@link defineHook}. Mirrors the
 * {@link EntityHookBase} method signatures, with a third `tools` argument.
 * Declare only the keys you need.
 */
export interface EntityHookFns<E extends PlainLiteralObject> {
  beforeFindOne?(
    options: RepositoryFindOneOptions<E>,
    ctx: Ctx,
    tools: EntityHookTools<E>,
  ): RepositoryFindOneOptions<E> | Promise<RepositoryFindOneOptions<E>>;
  afterFindOne?(
    entity: E | null,
    ctx: Ctx,
    tools: EntityHookTools<E>,
  ): (E | null) | Promise<E | null>;
  beforeFindAndCount?(
    options: RepositoryFindOptions<E>,
    ctx: Ctx,
    tools: EntityHookTools<E>,
  ): RepositoryFindOptions<E> | Promise<RepositoryFindOptions<E>>;
  afterFindAndCount?(
    result: { data: E[]; total: number },
    ctx: Ctx,
    tools: EntityHookTools<E>,
  ): { data: E[]; total: number } | Promise<{ data: E[]; total: number }>;
  beforeCreate?(payload: E, ctx: Ctx, tools: EntityHookTools<E>): E | Promise<E>;
  afterCreate?(entity: E, ctx: Ctx, tools: EntityHookTools<E>): E | Promise<E>;
  beforeUpdate?(payload: E, ctx: Ctx, tools: EntityHookTools<E>): E | Promise<E>;
  afterUpdate?(entity: E, ctx: Ctx, tools: EntityHookTools<E>): E | Promise<E>;
  beforeDelete?(entity: E, ctx: Ctx, tools: EntityHookTools<E>): E | Promise<E>;
  afterDelete?(entity: E, ctx: Ctx, tools: EntityHookTools<E>): E | Promise<E>;
  beforeSoftDelete?(
    entity: E,
    ctx: Ctx,
    tools: EntityHookTools<E>,
  ): E | Promise<E>;
  afterSoftDelete?(
    entity: E,
    ctx: Ctx,
    tools: EntityHookTools<E>,
  ): E | Promise<E>;
  beforeRestore?(entity: E, ctx: Ctx, tools: EntityHookTools<E>): E | Promise<E>;
  afterRestore?(entity: E, ctx: Ctx, tools: EntityHookTools<E>): E | Promise<E>;
}

type LifecycleFn<E extends PlainLiteralObject> = (
  arg0: unknown,
  ctx: Ctx,
  tools: EntityHookTools<E>,
) => unknown;

/**
 * Write `before*` lifecycles whose payload goes through the upstream
 * `preserve` merge — the membrane keeps the ORIGINAL payload reference and
 * discards any object the hook returns. For these, the wrapper merges the
 * function's returned object back into the original so authors can either
 * mutate in place OR return a new object; both take effect. Find-options
 * (`beforeFindOne`/`beforeFindAndCount`) and every `after*` lifecycle use
 * the return value directly, so they pass through untouched.
 */
const MERGE_BACK_KEYS: ReadonlySet<string> = new Set([
  'beforeCreate',
  'beforeUpdate',
  'beforeDelete',
  'beforeSoftDelete',
  'beforeRestore',
]);

/**
 * Builds an `@EntityHook`-decorated, DI-ready hook class from a plain
 * object of lifecycle functions — the functional counterpart to writing
 * a `PassthroughEntityHookBase` subclass by hand.
 *
 * The generated class is bound to `entity` (so it only fires on that
 * table, like `@EntityHook({ entity })`) and is registered as a provider
 * with the entity's dynamic repository injected, surfaced to every
 * function via `tools.repo`. `tools.actor` comes from the CRUD context.
 *
 * Only the keys present in `fns` become real lifecycle methods — the rest
 * stay passthrough no-ops, and the `@EntityHook` typo guard still applies.
 */
export function defineHook<E extends PlainLiteralObject>(
  entity: Type<E>,
  fns: EntityHookFns<E>,
): Type<EntityHookBase<E>> {
  class GeneratedEntityHook extends PassthroughEntityHookBase<E> {
    constructor(readonly repo: RepositoryInterface<E>) {
      super();
    }
  }

  Object.defineProperty(GeneratedEntityHook, 'name', {
    value: `${entity.name}FunctionalHook`,
  });

  for (const key of Object.keys(fns)) {
    const fn = fns[key as keyof EntityHookFns<E>] as LifecycleFn<E> | undefined;
    if (typeof fn !== 'function') continue;

    Object.defineProperty(GeneratedEntityHook.prototype, key, {
      configurable: true,
      writable: true,
      enumerable: false,
      value: async function (
        this: GeneratedEntityHook,
        arg0: unknown,
        ctx?: EntityHookContext,
      ): Promise<unknown> {
        const tools: EntityHookTools<E> = {
          repo: this.repo,
          actor: ctx === undefined ? undefined : getActor(ctx),
        };
        const result = await fn(arg0, ctx, tools);

        if (MERGE_BACK_KEYS.has(key)) {
          if (
            result &&
            typeof result === 'object' &&
            result !== arg0 &&
            arg0 &&
            typeof arg0 === 'object'
          ) {
            Object.assign(arg0, result);
          }
          return arg0;
        }
        return result;
      },
    });
  }

  EntityHook<E>({ entity })(GeneratedEntityHook);
  Injectable()(GeneratedEntityHook);
  InjectDynamicRepository(deriveEntityKey(entity))(
    GeneratedEntityHook,
    undefined,
    0,
  );

  return GeneratedEntityHook;
}
