import type { PlainLiteralObject, Type } from '@nestjs/common';
import type { z } from 'zod';
import type { SchemaEntityCompiler } from '../index';
import { getRegisteredEntity, registerSchemaEntity } from './schema-registry';

export interface ZodEntityCompileInput {
  readonly name: string;
  readonly schema: z.ZodObject;
  readonly entity?: Type<PlainLiteralObject>;
  readonly table?: string;
  readonly entityCompiler?: SchemaEntityCompiler;
  readonly repository?: {
    readonly entityCompiler?: SchemaEntityCompiler;
  };
}

export function compileZodEntity(
  input: ZodEntityCompileInput,
  source: string,
): Type<PlainLiteralObject> {
  const { name, schema, table, entity: entityOverride } = input;

  let entity: Type<PlainLiteralObject>;
  if (entityOverride !== undefined) {
    entity = entityOverride;
  } else {
    const registered = getRegisteredEntity(schema);
    if (registered !== undefined) {
      entity = registered;
    } else {
      const compiler = input.repository?.entityCompiler ?? input.entityCompiler;
      if (compiler === undefined) {
        throw new Error(
          `[${source}] "${name}" has no entity compiler. Bind one once via ` +
            'bindZodResources(compiler), or pass `entityCompiler` (or ' +
            '`repository.entityCompiler`).',
        );
      }
      entity = compiler.compileEntity(schema, {
        name: `${name}Entity`,
        table: table ?? `${name.toLowerCase()}s`,
      });
    }
  }

  registerSchemaEntity(schema, entity);
  return entity;
}
