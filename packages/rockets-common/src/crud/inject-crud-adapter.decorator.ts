import type { PlainLiteralObject, Type } from '@nestjs/common';
import { InjectCrudAdapter as InjectCrudAdapterByKey } from '@bitwild/rockets-crud';

import { resolveEntityKey } from '../utils/resolve-entity-key.util';

/**
 * Inject a CRUD adapter by entity class **or** string key.
 *
 * Class form is the recommended idiom — the key is derived via
 * `deriveEntityKey()` (strip trailing `Entity`, lowercase first char) so the
 * registration and the injection site agree without a separate
 * `*_ENTITY_KEY` constant. String form is the escape hatch for namespaced or
 * non-derived keys.
 *
 * Delegates to the upstream-parity string-only `InjectCrudAdapter` from
 * `@bitwild/rockets-crud`, resolving the class to its key first.
 *
 * @example
 * ```ts
 * constructor(
 *   @InjectCrudAdapter(UserEntity)
 *   protected readonly crudAdapter: CrudAdapter<UserEntity>,
 * ) {}
 * ```
 */
export function InjectCrudAdapter(
  keyOrClass: string | Type<PlainLiteralObject>,
): PropertyDecorator & ParameterDecorator {
  return InjectCrudAdapterByKey(resolveEntityKey(keyOrClass));
}
