import type { PlainLiteralObject, Type } from '@nestjs/common';
import { z } from 'zod';
import type {
  OwnerStampHookOptions,
  RocketsResourceDefinition,
  RocketsSubResourceInput,
  SchemaEntityCompiler,
} from '../index';
import type { ZodCrudOperation, ZodResourceOperations } from './zod-operations';

/**
 * Declarative resource definition with a zod schema as the single
 * source of truth: request/response schemas AND the entity class are
 * compiled from it.
 */
export interface ZodResourceDefinition
  extends Omit<
    RocketsResourceDefinition<PlainLiteralObject>,
    'entity' | 'dto' | 'operations'
  > {
  /** PascalCase base for generated names (`Tag` → `TagCreateDto`, `TagEntity`). */
  readonly name: string;
  readonly schema: z.ZodObject;
  readonly entity?: Type<PlainLiteralObject>;
  /** Physical table name for the generated entity. Default: lowercased `name` + 's'. */
  readonly table?: string;
  readonly entityCompiler?: SchemaEntityCompiler;
  readonly operations?: readonly ZodCrudOperation[] | ZodResourceOperations;
  readonly owner?: string | ZodOwnerConfig;
  readonly ownerStamp?: boolean;
  /**
   * When `false`, skip auto-wiring {@link OwnerScopeHook} for owner
   * columns. Default `true` (read-side ownership enforced whenever
   * `f.owner()` / `owner` is present). Write-side stamping is gated by
   * {@link ownerStamp}.
   */
  readonly ownerScope?: boolean;
}

export interface ZodOwnerConfig extends OwnerStampHookOptions {
  readonly column: string;
}

/**
 * The named OpenAPI schemas a zod resource compiles to. Every entry is
 * wrapped with `withOpenApi(schema, id)` — the ids are the component
 * names in the generated document (`TagResponseDto`, `TagCreateDto`, …).
 */
export interface ZodResourceSchemas {
  readonly request: {
    readonly create?: z.ZodType;
    readonly update?: z.ZodType;
    readonly replace?: z.ZodType;
  };
  readonly response: {
    /** Single-item response (`${Name}ResponseDto`). */
    readonly resource: z.ZodType;
    /** List envelope (`${Name}ResponseDtoPaginatedDto`). */
    readonly paginated: z.ZodType;
  };
}

export interface ZodResourceManifest {
  readonly definition: ZodResourceDefinition | ZodSubResourceDefinition;
  readonly schemas: ZodResourceSchemas;
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
  /** See {@link ZodResourceDefinition.ownerScope}. Default `true`. */
  readonly ownerScope?: boolean;
}
