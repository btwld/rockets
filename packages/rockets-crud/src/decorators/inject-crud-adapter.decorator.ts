import { Inject } from '@nestjs/common';
import type { PlainLiteralObject, Type } from '@nestjs/common';
// `getDynamicAdapterToken` is not on upstream's public barrel — see the
// TODO note in `../index.ts` for tracking.
import { getDynamicAdapterToken } from '@concepta/nestjs-crud/dist/infrastructure/utils/crud-infra.utils';
import { resolveEntityKey } from '@bitwild/rockets-common';

/**
 * Inject a CRUD adapter by entity class **or** string key.
 *
 * Class form is the recommended idiom — the key is derived via
 * `deriveEntityKey()` so the adapter registration in
 * `defineResource({ entity })` and the injection site agree without a
 * separate `*_ENTITY_KEY` constant.
 *
 * String form is the escape hatch for namespaced keys.
 *
 * @example
 * ```ts
 * constructor(
 *   @InjectCrudAdapter(PetEntity)
 *   readonly crudAdapter: CrudAdapter<PetEntity>,
 * ) {}
 * ```
 */
export function InjectCrudAdapter(
  keyOrClass: string | Type<PlainLiteralObject>,
): PropertyDecorator & ParameterDecorator {
  return Inject(getDynamicAdapterToken(resolveEntityKey(keyOrClass)));
}
