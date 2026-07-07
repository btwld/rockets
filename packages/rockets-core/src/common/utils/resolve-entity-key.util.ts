import type { PlainLiteralObject, Type } from '@nestjs/common';
import { deriveEntityKey } from './derive-entity-key.util';

/**
 * Resolve either an explicit string key or an entity class shorthand
 * into the canonical repository / adapter key.
 */
export function resolveEntityKey(
  keyOrClass: string | Type<PlainLiteralObject>,
): string {
  return typeof keyOrClass === 'function'
    ? deriveEntityKey(keyOrClass)
    : keyOrClass;
}
