import { Inject } from '@nestjs/common';
import type { PlainLiteralObject, Type } from '@nestjs/common';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { resolveEntityKey } from '@bitwild/rockets-common';

/**
 * Inject a dynamic repository by entity class **or** string key.
 *
 * Class form is the recommended idiom — the key is derived via
 * `deriveEntityKey()` (strip trailing `Entity`, lowercase first char) so
 * the registration in `defineResource({ entity })` and the injection
 * site agree without a separate `*_ENTITY_KEY` constant.
 *
 * String form is the escape hatch for namespaced or non-derived keys
 * (e.g. `'billing/invoice'`).
 *
 * @example
 * Class form (recommended):
 * ```ts
 * constructor(
 *   @InjectDynamicRepository(UserEntity)
 *   private readonly repo: RepositoryInterface<UserEntity>,
 * ) {}
 * ```
 *
 * @example
 * String form (escape hatch for namespaced keys):
 * ```ts
 * constructor(
 *   @InjectDynamicRepository('billing/invoice')
 *   private readonly repo: RepositoryInterface<InvoiceEntity>,
 * ) {}
 * ```
 */
export function InjectDynamicRepository(
  keyOrClass: string | Type<PlainLiteralObject>,
): PropertyDecorator & ParameterDecorator {
  return Inject(getDynamicRepositoryToken(resolveEntityKey(keyOrClass)));
}
