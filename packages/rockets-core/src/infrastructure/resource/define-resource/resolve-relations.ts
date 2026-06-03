import type { PlainLiteralObject } from '@nestjs/common';
import type {
  RocketsResourceDefinition,
  ResourceRelationEntry,
} from '../../../domain/interfaces/rockets-resource-definition.interface';
import { createBoundRelation } from '../relation';

export function resolveRelations<E extends PlainLiteralObject>(
  key: string,
  entity: RocketsResourceDefinition<E>['entity'],
  input: RocketsResourceDefinition<E>['relations'],
): ReadonlyArray<ResourceRelationEntry<E>> | undefined {
  if (input === undefined) return undefined;
  const resolved =
    typeof input === 'function' ? input(createBoundRelation(entity)) : input;
  assertRelationsValid(key, resolved);
  return resolved;
}

function assertRelationsValid(
  resourceKey: string,
  relations: readonly ResourceRelationEntry[],
): void {
  const seen = new Set<string>();
  for (const entry of relations) {
    if (typeof entry.source !== 'function') {
      throw new Error(
        `defineResource(${resourceKey}): every relation must declare a class \`source\` (use the \`relation()\` helper).`,
      );
    }
    if (typeof entry.target !== 'function') {
      throw new Error(
        `defineResource(${resourceKey}): every relation must declare a class \`target\` or a \`() => Class\` thunk.`,
      );
    }
    if (!entry.propertyName || typeof entry.propertyName !== 'string') {
      throw new Error(
        `defineResource(${resourceKey}): every relation must have a non-empty string \`propertyName\`.`,
      );
    }
    if (seen.has(entry.propertyName)) {
      throw new Error(
        `defineResource(${resourceKey}): duplicate relation propertyName "${entry.propertyName}". ` +
          `Each property on the source entity may carry at most one relation declaration.`,
      );
    }
    seen.add(entry.propertyName);
  }
}
