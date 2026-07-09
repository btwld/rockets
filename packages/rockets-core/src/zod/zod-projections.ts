import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import type { ResourceRelationEntry } from '../index';
import { resolveRelationTarget } from './schema-registry';
import {
  isDbGenerated,
  relationPropertyFor,
  type RocketsRelationTarget,
  unwrapField,
} from './field-meta';

export interface SchemaProjections {
  readonly create: Record<string, z.ZodType>;
  readonly update: Record<string, z.ZodType>;
  readonly response: Record<string, z.ZodType>;
  readonly responseNested: Record<string, z.ZodObject>;
  readonly pkKey: string | undefined;
  readonly relations: ReadonlyArray<ResourceRelationEntry<PlainLiteralObject>>;
}

/**
 * Split the schema into create/update/response DTO projections and
 * relation entries derived from field metadata.
 */
export function projectSchema(
  resourceName: string,
  schema: z.ZodObject,
  entity: Type<PlainLiteralObject>,
  ownerColumns: ReadonlySet<string>,
): SchemaProjections {
  const create: Record<string, z.ZodType> = {};
  const update: Record<string, z.ZodType> = {};
  const response: Record<string, z.ZodType> = {};
  const responseNested: Record<string, z.ZodObject> = {};
  const relations: ResourceRelationEntry<PlainLiteralObject>[] = [];
  let pkKey: string | undefined;

  for (const [key, field] of Object.entries(schema.shape)) {
    const path = `${resourceName}.${key}`;
    const { meta } = unwrapField(field, path);
    const relation = meta.relation;

    if (meta.compute !== undefined) {
      response[key] = field;
      continue;
    }

    if (relation?.kind === 'hasMany') {
      if (relation.expose === true) {
        const nested = exposedResponseSchema(
          relation.shape ?? relation.target,
          path,
        );
        responseNested[key] = nested;
        response[key] = z.array(nested).optional();
      }
      if (relation.include !== undefined) {
        relations.push({
          source: entity,
          target: () => resolveRelationTarget(relation.target, path),
          propertyName: key,
          include: relation.include,
        });
      }
      continue;
    }

    const generated = isDbGenerated(meta);
    const isPk = meta.db?.pk === true;
    if (isPk) {
      pkKey = key;
    }

    const isOwner = ownerColumns.has(key);

    if (!isOwner && (meta.dto?.create ?? !generated)) {
      create[key] = field;
    }
    if (
      !isOwner &&
      (isPk ? meta.dto?.update !== false : meta.dto?.update ?? !generated)
    ) {
      update[key] = field.optional();
    }
    if (meta.dto?.response ?? true) {
      response[key] = field;
    }

    if (relation !== undefined) {
      const property = relationPropertyFor(key, relation, path);
      if (relation.expose === true) {
        const nested = exposedResponseSchema(
          relation.shape ?? relation.target,
          path,
        );
        responseNested[property] = nested;
        response[property] = nested.optional();
      }
      if (relation.include !== undefined) {
        relations.push({
          source: entity,
          target: () => resolveRelationTarget(relation.target, path),
          propertyName: property,
          include: relation.include,
        });
      }
    }
  }

  return { create, update, response, responseNested, pkKey, relations };
}

export function hasDeletedAtField(schema: z.ZodObject): boolean {
  return Object.entries(schema.shape).some(
    ([key, field]) => unwrapField(field, key).meta.db?.deletedAt === true,
  );
}

function exposedResponseSchema(
  target: RocketsRelationTarget,
  path: string,
): z.ZodObject {
  const resolved = target();
  if (!(resolved instanceof z.ZodObject)) {
    throw new Error(
      `[zodResource] Relation at "${path}" sets expose:true but targets an ` +
        'entity class — only a zod schema target can be projected into the ' +
        'response document.',
    );
  }
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(resolved.shape)) {
    const { meta } = unwrapField(field, `${path}.${key}`);
    if (meta.dto?.response ?? true) {
      shape[key] = field;
    }
  }
  return z.object(shape);
}
