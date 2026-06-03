import type { PlainLiteralObject } from '@nestjs/common';
import type { RocketsResourceDefinition } from '../../../domain/interfaces/rockets-resource-definition.interface';
import {
  isNonEmptyStringArray,
  isNonEmptyStringOrStringArray,
} from './string-guards';

export function validateDefinition<E extends PlainLiteralObject>(
  definition: RocketsResourceDefinition<E>,
): void {
  if (!definition.entity || typeof definition.entity !== 'function') {
    throw new Error('defineResource: `entity` must be a class constructor.');
  }
  if (
    definition.key !== undefined &&
    (typeof definition.key !== 'string' || definition.key.length === 0)
  ) {
    throw new Error(
      `defineResource(${definition.entity.name}): when provided, ` +
        '`key` must be a non-empty string.',
    );
  }
  const tag = definition.key ?? definition.entity.name;
  if (
    definition.path !== undefined &&
    !isNonEmptyStringOrStringArray(definition.path)
  ) {
    throw new Error(
      `defineResource(${tag}): when provided, \`path\` must be a non-empty string or string array.`,
    );
  }
  if (
    definition.tags !== undefined &&
    !isNonEmptyStringArray(definition.tags)
  ) {
    throw new Error(
      `defineResource(${tag}): when provided, \`tags\` must be a non-empty array of non-empty strings.`,
    );
  }
  if (
    Array.isArray(definition.operations) &&
    definition.operations.length === 0
  ) {
    throw new Error(
      `defineResource(${tag}): \`operations\` cannot be an empty array.`,
    );
  }
  if (
    definition.operations !== undefined &&
    !Array.isArray(definition.operations) &&
    typeof definition.operations === 'object' &&
    Object.keys(definition.operations).length === 0
  ) {
    throw new Error(
      `defineResource(${tag}): \`operations\` cannot be an empty object.`,
    );
  }
}
