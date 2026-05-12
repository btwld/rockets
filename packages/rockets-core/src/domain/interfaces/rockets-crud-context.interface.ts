import type { PlainLiteralObject } from '@nestjs/common';
import type { CrudContextInterface } from '@bitwild/rockets-crud';
import type { AppContextInterface } from '@bitwild/rockets-common';

/**
 * Concrete context shape passed to {@link EntityHookBase} lifecycle methods
 * and any other repository-hook handler running inside the CRUD pipeline.
 *
 * Combines:
 * - Upstream `CrudContextInterface` with `entity`, `params`, `query`,
 *   `operation`, `action`, and `options`. It remains an open record via
 *   `PlainLiteralObject`.
 * - `AppContextInterface` — `with(overlay)` accessor used by `getActor()`
 *   to read the `Actor` overlay published by `ActorOverlay`.
 *
 * Hooks read the actor via the `getActor(ctx)` helper rather than typing
 * `ctx.actor` directly — the actor is published into the overlay at
 * request time, not stored on the context shape itself.
 *
 * Generic `<E>` is preserved at the type level so consumers can narrow
 * `params`/`query` shapes when they need to. Most hook code stays on the
 * default `PlainLiteralObject` because the same hook serves multiple
 * resources.
 */
export interface RocketsCrudContext<
  E extends PlainLiteralObject = PlainLiteralObject,
> extends CrudContextInterface<E>,
    AppContextInterface {}
