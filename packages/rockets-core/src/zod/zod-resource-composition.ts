import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import {
  OwnerStampHook,
  type ResourceRelationEntry,
  type RocketsResourceDefinition,
} from '../index';
import { unwrapField } from './field-meta';
import type { ZodOwnerConfig } from './zod-resource-contracts';

/**
 * The owner column(s) of a schema: every field marked `{ owner: true }`,
 * plus the resource-level `owner: 'fieldName'` when given.
 */
export function resolveOwnerColumns(
  schema: z.ZodObject,
  resourceName: string,
  owner: string | ZodOwnerConfig | undefined,
): string[] {
  const ownerColumn = typeof owner === 'string' ? owner : owner?.column;
  const columns = Object.entries(schema.shape)
    .filter(([key, field]) => unwrapField(field, key).meta.owner === true)
    .map(([key]) => key);

  if (ownerColumn !== undefined && !columns.includes(ownerColumn)) {
    const field = schema.shape[ownerColumn];
    if (field === undefined) {
      throw new Error(
        `[zodResource] "${resourceName}" sets owner: '${ownerColumn}' but the ` +
          'schema has no such field — declare it (e.g. `owner: z.uuid()`).',
      );
    }
    const { base, meta } = unwrapField(field, `${resourceName}.${ownerColumn}`);
    if (
      meta.compute !== undefined ||
      meta.relation !== undefined ||
      !(base instanceof z.ZodString || base instanceof z.ZodUUID)
    ) {
      throw new Error(
        `[zodResource] "${resourceName}" owner: '${ownerColumn}' must be a ` +
          'persisted string/uuid column (not a relation, computed or ' +
          'non-string field).',
      );
    }
    columns.push(ownerColumn);
  }
  return columns;
}

export function applyOwnerStamp(
  entity: Type<PlainLiteralObject>,
  ownerColumns: readonly string[],
  userHooks: RocketsResourceDefinition<PlainLiteralObject>['hooks'],
  ownerStamp: boolean | undefined,
  owner: string | ZodOwnerConfig | undefined,
): RocketsResourceDefinition<PlainLiteralObject>['hooks'] {
  if (ownerStamp === false || ownerColumns.length === 0) {
    return userHooks;
  }
  const stampOptions = typeof owner === 'string' ? undefined : owner;
  const stampHooks = ownerColumns.map((column) =>
    OwnerStampHook.for(entity, column, stampOptions),
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
