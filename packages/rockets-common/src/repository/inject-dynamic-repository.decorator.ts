import type { PlainLiteralObject, Type } from '@nestjs/common';
import { InjectDynamicRepository as InjectDynamicRepositoryByKey } from '@bitwild/rockets-repository';

import { resolveEntityKey } from '../utils/resolve-entity-key.util';

/**
 * Inject a dynamic repository by entity class **or** string key.
 *
 * Class form is the recommended idiom — the key is derived via
 * `deriveEntityKey()` (strip trailing `Entity`, lowercase first char) so the
 * registration and the injection site agree without a separate
 * `*_ENTITY_KEY` constant. String form is the escape hatch for namespaced or
 * non-derived keys (e.g. `'billing/invoice'`).
 *
 * Delegates to the upstream-parity string-only `InjectDynamicRepository` from
 * `@bitwild/rockets-repository`, resolving the class to its key first.
 *
 * @example
 * ```ts
 * constructor(
 *   @InjectDynamicRepository(UserEntity)
 *   private readonly repo: RepositoryInterface<UserEntity>,
 * ) {}
 * ```
 */
export function InjectDynamicRepository(
  keyOrClass: string | Type<PlainLiteralObject>,
): PropertyDecorator & ParameterDecorator {
  return InjectDynamicRepositoryByKey(resolveEntityKey(keyOrClass));
}
