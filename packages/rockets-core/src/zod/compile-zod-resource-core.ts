import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import type {
  ResourceOperationsObject,
  ResourceRelationEntry,
  RocketsResourceDefinition,
  SchemaEntityCompiler,
} from '../index';
import { compileZodEntity } from './compile-zod-entity';
import { compileDtoClass } from './zod-dto';
import {
  normalizeOperations,
  opConfig,
  type ZodCrudOperation,
  zodOpConfig,
  type ZodResourceOperations,
} from './zod-operations';
import { hasDeletedAtField, projectSchema } from './zod-projections';
import { resolveOwnerColumns } from './zod-resource-composition';
import type { ZodOwnerConfig, ZodResourceDtos } from './zod-resource-contracts';

export interface ZodCoreInput {
  readonly name: string;
  readonly schema: z.ZodObject;
  readonly entity?: Type<PlainLiteralObject>;
  readonly table?: string;
  readonly operations?: readonly ZodCrudOperation[] | ZodResourceOperations;
  readonly owner?: string | ZodOwnerConfig;
  readonly entityCompiler?: SchemaEntityCompiler;
  readonly repository?: RocketsResourceDefinition<PlainLiteralObject>['repository'];
}

export interface CompiledZodCore {
  readonly entity: Type<PlainLiteralObject>;
  readonly operations: ResourceOperationsObject;
  readonly relations: ReadonlyArray<ResourceRelationEntry<PlainLiteralObject>>;
  readonly dtos: ZodResourceDtos;
  readonly ownerColumns: string[];
}

export function compileZodCore(input: ZodCoreInput): CompiledZodCore {
  const { name, schema, entity: entityOverride } = input;
  const entity = compileZodEntity(input, 'zodResource');

  const ops = normalizeOperations(input.operations);
  const enabled = (op: ZodCrudOperation): boolean =>
    ops[op] !== undefined && ops[op] !== false;

  const ownerColumns = resolveOwnerColumns(schema, name, input.owner);
  const projections = projectSchema(
    name,
    schema,
    entity,
    new Set(ownerColumns),
  );

  if (
    (enabled('create') || enabled('replace')) &&
    Object.keys(projections.create).length === 0
  ) {
    throw new Error(
      `[zodResource] "${name}" enables create/replace but every field is ` +
        'excluded from the create projection (db-generated or ' +
        'dto.create: false) — nothing would be writable.',
    );
  }
  if (
    (enabled('update') || enabled('replace')) &&
    projections.pkKey === undefined
  ) {
    throw new Error(
      `[zodResource] "${name}" enables update/replace but no field is ` +
        'marked { db: { pk: true } }.',
    );
  }
  const deleteConfig = opConfig(ops.delete);
  if (
    'soft' in deleteConfig &&
    deleteConfig.soft === true &&
    entityOverride === undefined &&
    !hasDeletedAtField(schema)
  ) {
    throw new Error(
      `[zodResource] "${name}" enables delete: { soft: true } but no field ` +
        'is marked { db: { deletedAt: true } } — the generated entity would ' +
        'have no delete-date column and soft removal would fail at runtime.',
    );
  }

  const responseNested = Object.fromEntries(
    Object.entries(projections.responseNested).map(([property, shape]) => [
      property,
      compileDtoClass(shape, `${name}${pascal(property)}ResponseDto`),
    ]),
  );
  const response = compileDtoClass(
    z.object(projections.response),
    `${name}ResponseDto`,
    responseNested,
  );
  const create = enabled('create')
    ? compileDtoClass(z.object(projections.create), `${name}CreateDto`)
    : undefined;
  const update = enabled('update')
    ? compileDtoClass(z.object(projections.update), `${name}UpdateDto`)
    : undefined;
  const replace = enabled('replace')
    ? compileDtoClass(z.object(projections.create), `${name}ReplaceDto`)
    : undefined;

  const operations: ResourceOperationsObject = {
    ...(enabled('list')
      ? { list: { ...zodOpConfig(ops.list), output: response } }
      : {}),
    ...(enabled('read')
      ? { read: { ...zodOpConfig(ops.read), output: response } }
      : {}),
    ...(enabled('create') && create !== undefined
      ? {
          create: {
            ...zodOpConfig(ops.create),
            input: create,
            output: response,
          },
        }
      : {}),
    ...(enabled('update') && update !== undefined
      ? {
          update: {
            ...zodOpConfig(ops.update),
            input: update,
            output: response,
          },
        }
      : {}),
    ...(enabled('replace') && replace !== undefined
      ? {
          replace: {
            ...zodOpConfig(ops.replace),
            input: replace,
            output: response,
          },
        }
      : {}),
    ...(enabled('delete') ? { delete: zodOpConfig(ops.delete) } : {}),
    ...(enabled('restore') ? { restore: zodOpConfig(ops.restore) } : {}),
  };

  return {
    entity,
    operations,
    relations: projections.relations,
    dtos: { response, create, update, replace },
    ownerColumns,
  };
}

function pascal(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
