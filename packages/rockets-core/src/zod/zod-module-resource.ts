import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import {
  defineModuleResource,
  type DefineModuleResourceInput,
  type ModuleResource,
  type RocketsRepositoryModuleInterface,
  type SchemaEntityCompiler,
} from '../index';
import type {
  ModuleResourceEntityEntryInput,
  ModuleResourceEntityInput,
} from '../domain/interfaces/module-resource.interface';
import { compileZodEntity } from './compile-zod-entity';

export interface ZodModuleResourceEntityDefinition {
  readonly name: string;
  readonly schema: z.ZodObject;
  readonly entity?: Type<PlainLiteralObject>;
  readonly table?: string;
  readonly key?: string;
  readonly entityCompiler?: SchemaEntityCompiler;
  readonly repository?: RocketsRepositoryModuleInterface;
  readonly collection?: string;
}

export type ZodModuleResourceEntityInput =
  | ModuleResourceEntityInput
  | ZodModuleResourceEntityDefinition;

export interface ZodModuleResourceInput
  extends Omit<DefineModuleResourceInput, 'entities'> {
  readonly entities?: ReadonlyArray<ZodModuleResourceEntityInput>;
  readonly entityCompiler?: SchemaEntityCompiler;
}

function isZodModuleResourceEntityDefinition(
  input: ZodModuleResourceEntityInput,
): input is ZodModuleResourceEntityDefinition {
  return typeof input === 'object' && input !== null && 'schema' in input;
}

function compileZodModuleResourceEntity(
  input: ZodModuleResourceEntityInput,
  defaultCompiler: SchemaEntityCompiler | undefined,
): ModuleResourceEntityInput {
  if (!isZodModuleResourceEntityDefinition(input)) {
    return input;
  }

  const entity = compileZodEntity(
    {
      name: input.name,
      schema: input.schema,
      table: input.table,
      entity: input.entity,
      entityCompiler: input.entityCompiler ?? defaultCompiler,
      repository: input.repository,
    },
    'zodModuleResource',
  );

  const entry: ModuleResourceEntityEntryInput = {
    entity,
    ...(input.key !== undefined ? { key: input.key } : {}),
    ...(input.repository !== undefined ? { repository: input.repository } : {}),
    ...(input.collection !== undefined ? { collection: input.collection } : {}),
  };

  return entry;
}

/**
 * Zod counterpart for `defineModuleResource()`: contributes non-CRUD
 * persistence rows and/or a Nest module slice, while allowing `entities[]`
 * to contain either handwritten entity classes or zod schema-backed entity
 * definitions.
 */
export function zodModuleResource(
  input: ZodModuleResourceInput,
): ModuleResource {
  const { entities = [], entityCompiler, ...passthrough } = input;

  return defineModuleResource({
    ...passthrough,
    entities: entities.map((entity) =>
      compileZodModuleResourceEntity(entity, entityCompiler),
    ),
  });
}
