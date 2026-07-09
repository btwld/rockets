import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import {
  OwnerStampHook,
  type ResourceRelationEntry,
  type RocketsResourceDefinition,
} from '../index';
import { unwrapField } from './field-meta';

/**
 * The owner column(s) of a schema: every field marked `{ owner: true }`,
 * plus the resource-level `owner: 'fieldName'` when given.
 */
export function resolveOwnerColumns(
  schema: z.ZodObject,
  resourceName: string,
  owner: string | undefined,
): string[] {
  const columns = Object.entries(schema.shape)
    .filter(([key, field]) => unwrapField(field, key).meta.owner === true)
    .map(([key]) => key);

  if (owner !== undefined && !columns.includes(owner)) {
    const field = schema.shape[owner];
    if (field === undefined) {
      throw new Error(
        `[zodResource] "${resourceName}" sets owner: '${owner}' but the ` +
          'schema has no such field — declare it (e.g. `owner: z.uuid()`).',
      );
    }
    const { base, meta } = unwrapField(field, `${resourceName}.${owner}`);
    if (
      meta.compute !== undefined ||
      meta.relation !== undefined ||
      !(base instanceof z.ZodString || base instanceof z.ZodUUID)
    ) {
      throw new Error(
        `[zodResource] "${resourceName}" owner: '${owner}' must be a ` +
          'persisted string/uuid column (not a relation, computed or ' +
          'non-string field).',
      );
    }
    columns.push(owner);
  }
  return columns;
}

export function applyOwnerStamp(
  entity: Type<PlainLiteralObject>,
  ownerColumns: readonly string[],
  userHooks: RocketsResourceDefinition<PlainLiteralObject>['hooks'],
  ownerStamp: boolean | undefined,
): RocketsResourceDefinition<PlainLiteralObject>['hooks'] {
  if (ownerStamp === false || ownerColumns.length === 0) {
    return userHooks;
  }
  const stampHooks = ownerColumns.map((column) =>
    OwnerStampHook.for(entity, column),
  );
  return [...stampHooks, ...(userHooks ?? [])];
}

export function mergeRelations(
  user: RocketsResourceDefinition<PlainLiteralObject>['relations'],
  extra: ReadonlyArray<ResourceRelationEntry<PlainLiteralObject>>,
): RocketsResourceDefinition<PlainLiteralObject>['relations'] {
  if (extra.length === 0) {
    return user;
  }
  if (user === undefined) {
    return extra;
  }
  if (typeof user === 'function') {
    return (relation) => [...user(relation), ...extra];
  }
  return [...user, ...extra];
}
