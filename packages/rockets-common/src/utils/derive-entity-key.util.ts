import type { PlainLiteralObject, Type } from '@nestjs/common';

/**
 * Derive a persistence key from an entity class name.
 *
 * Algorithm:
 *  - If the class name ends in `Entity`, strip the suffix.
 *  - Lowercase the first character (PascalCase → camelCase).
 *
 * Use the explicit `key` form when the derived key would collide or
 * the convention does not fit (e.g. `URLEntity` → `uRL`).
 *
 * @example
 * Input → output:
 *
 * ```ts
 * deriveEntityKey(UserEntity)      // → 'user'
 * deriveEntityKey(PetTagEntity)    // → 'petTag'
 * deriveEntityKey(Order)           // → 'order'  (no `Entity` suffix to strip)
 * deriveEntityKey(class {})        // throws — anonymous class
 * deriveEntityKey(class Entity {}) // throws — empty after strip
 * ```
 */
export function deriveEntityKey(cls: Type<PlainLiteralObject>): string {
  const raw = cls.name;
  if (!raw) {
    throw new Error(
      'deriveEntityKey: anonymous class — pass an explicit key instead ' +
        'of the class shorthand.',
    );
  }
  const trimmed = raw.endsWith('Entity') ? raw.slice(0, -'Entity'.length) : raw;
  if (trimmed.length === 0) {
    throw new Error(
      `deriveEntityKey: class "${raw}" stripped to empty — the literal ` +
        '`Entity` name is ambiguous; pass an explicit key.',
    );
  }
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}
