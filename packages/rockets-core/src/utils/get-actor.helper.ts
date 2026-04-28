import type { PlainLiteralObject } from '@nestjs/common';
import type { AppContextInterface } from '@concepta/nestjs-common';
import type { Actor } from '../domain/interfaces/actor.interface';
import { ActorCtx } from '../infrastructure/interceptors/actor.overlay';

/**
 * Reads the `Actor` overlay from any object that exposes the
 * `AppContextInterface.with()` accessor — typically the CRUD context the
 * upstream `@Ctx(CrudCtx)` decorator delivers, or any AppContextHost
 * produced outside HTTP (jobs, CLI).
 *
 * Returns `undefined` when no overlay is defined. Hooks consume this when
 * they only need "who" — for richer authorization data (roles, claims),
 * `getAuthorizedUserFromCrudContext` is the right helper.
 */
export function getActor<T extends PlainLiteralObject>(
  context: T | undefined,
): Actor | undefined {
  if (!hasOverlayAccessor(context)) return undefined;
  return context.with(ActorCtx);
}

function hasOverlayAccessor(value: unknown): value is AppContextInterface {
  return (
    typeof value === 'object' &&
    value !== null &&
    'with' in value &&
    typeof (value as { with: unknown }).with === 'function'
  );
}
