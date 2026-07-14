import type { PlainLiteralObject } from '@nestjs/common';
import type { AppContextInterface } from '@concepta/nestjs-core';
import type { Actor } from '../domain/interfaces/actor.interface';
import type { RocketsCrudContext } from '../domain/interfaces/rockets-crud-context.interface';
import { ActorCtx } from '../infrastructure/interceptors/actor.overlay';

/**
 * Reads the `Actor` overlay from any object that exposes the
 * `AppContextInterface.with()` accessor — typically the CRUD context the
 * upstream `@Ctx(CrudCtx)` decorator delivers, or any AppContextHost
 * produced outside HTTP (jobs, CLI).
 *
 * Returns `undefined` when no overlay is defined. Hooks consume this when
 * they only need "who".
 */
export function getActor<T extends PlainLiteralObject>(
  context: T | undefined,
): Actor | undefined {
  if (!hasOverlayAccessor(context)) return undefined;
  if (!context.supports(ActorCtx)) return undefined;
  return context.with(ActorCtx);
}

/**
 * Narrows an open `PlainLiteralObject` repository-hook context into a
 * concrete {@link RocketsCrudContext} when the call originated inside the
 * CRUD pipeline (i.e. has `entity`, `params`, and `operation`). Returns
 * `undefined` for non-CRUD invocations (background jobs, internal repo
 * calls) so hooks can branch declaratively rather than via `as` casts.
 *
 * @example
 * ```ts
 * override beforeFindOne(options, ctx) {
 *   const crudCtx = getCrudContext(ctx);
 *   const petId = crudCtx?.params?.petId;
 *   // ...
 * }
 * ```
 */
export function getCrudContext<
  E extends PlainLiteralObject = PlainLiteralObject,
>(context: PlainLiteralObject | undefined): RocketsCrudContext<E> | undefined {
  if (!context || typeof context !== 'object') return undefined;
  if (
    typeof (context as { entity?: unknown }).entity !== 'string' ||
    typeof (context as { params?: unknown }).params !== 'object' ||
    typeof (context as { operation?: unknown }).operation !== 'string'
  ) {
    return undefined;
  }
  return context as RocketsCrudContext<E>;
}

function hasOverlayAccessor(value: unknown): value is AppContextInterface {
  return (
    typeof value === 'object' &&
    value !== null &&
    'with' in value &&
    typeof (value as { with: unknown }).with === 'function' &&
    'supports' in value &&
    typeof (value as { supports: unknown }).supports === 'function'
  );
}
