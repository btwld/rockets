import { Inject } from '@nestjs/common';
import type { PlainLiteralObject, Type } from '@nestjs/common';
import { resolveEntityKey } from '@bitwild/rockets-app';

import { getDynamicAdapterToken } from '../../utils/crud-infra.utils';

/**
 * Decorator to inject a CRUD adapter by entity class **or** string key.
 *
 * Class form is the recommended idiom — the key is derived via
 * `deriveEntityKey()` (strip trailing `Entity`, lowercase first char) so
 * the registration and the injection site agree without a separate
 * `*_ENTITY_KEY` constant. String form is the escape hatch for namespaced
 * or non-derived keys.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class SomeService {
 *   constructor(
 *     @InjectCrudAdapter(UserEntity)
 *     protected readonly crudAdapter: CrudAdapter<UserEntity>,
 *   ) {}
 * }
 * ```
 *
 * @param keyOrClass - The entity class or the string key used in the model configuration
 * @returns A parameter decorator for dependency injection
 */
export function InjectCrudAdapter(
  keyOrClass: string | Type<PlainLiteralObject>,
): PropertyDecorator & ParameterDecorator {
  return Inject(getDynamicAdapterToken(resolveEntityKey(keyOrClass)));
}
