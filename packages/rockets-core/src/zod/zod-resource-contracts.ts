import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import type {
  RocketsResourceDefinition,
  RocketsSubResourceInput,
  SchemaEntityCompiler,
} from '../index';
import type { ZodCrudOperation, ZodResourceOperations } from './zod-operations';

/**
 * Declarative resource definition with a zod schema as the single
 * source of truth: DTOs AND the entity class are compiled from it.
 */
export interface ZodResourceDefinition
  extends Omit<
    RocketsResourceDefinition<PlainLiteralObject>,
    'entity' | 'dto' | 'operations'
  > {
  /** PascalCase base for generated class names (`Tag` → `TagCreateDto`, `TagEntity`). */
  readonly name: string;
  readonly schema: z.ZodObject;
  readonly entity?: Type<PlainLiteralObject>;
  /** Physical table name for the generated entity. Default: lowercased `name` + 's'. */
  readonly table?: string;
  readonly entityCompiler?: SchemaEntityCompiler;
  readonly operations?: readonly ZodCrudOperation[] | ZodResourceOperations;
  readonly owner?: string;
  readonly ownerStamp?: boolean;
}

export interface ZodResourceDtos {
  readonly response: Type<object>;
  readonly create?: Type<object>;
  readonly update?: Type<object>;
  readonly replace?: Type<object>;
}

export interface ZodResourceManifest {
  readonly definition: ZodResourceDefinition | ZodSubResourceDefinition;
  readonly dtos: ZodResourceDtos;
  readonly entity: Type<PlainLiteralObject>;
}

/**
 * Sub-resource definition with a zod schema as the source of truth —
 * the schema-driven counterpart of `defineSubResource`.
 */
export interface ZodSubResourceDefinition
  extends Omit<
    RocketsSubResourceInput<PlainLiteralObject>,
    'entity' | 'dto' | 'operations'
  > {
  readonly name: string;
  readonly schema: z.ZodObject;
  readonly entity?: Type<PlainLiteralObject>;
  readonly table?: string;
  readonly entityCompiler?: SchemaEntityCompiler;
  readonly operations?: readonly ZodCrudOperation[] | ZodResourceOperations;
  /** See {@link ZodResourceDefinition.ownerStamp}. Default `true`. */
  readonly ownerStamp?: boolean;
}
