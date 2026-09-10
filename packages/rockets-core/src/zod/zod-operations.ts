import type { z } from 'zod';
import type {
  ResourceDeleteOperationConfig,
  ResourceOperationConfig,
  ResourceRestoreOperationConfig,
} from '../index';

export type ZodCrudOperation =
  | 'list'
  | 'read'
  | 'create'
  | 'update'
  | 'replace'
  | 'delete'
  | 'restore';

/**
 * Per-operation `input` / `output` overrides on the zod path.
 *
 * Both are compiled into named OpenAPI components with the same pipeline
 * the schema-derived projections use (Standard Schema validation on the
 * way in, schema serialization on the way out). Omit either one to keep
 * the projection derived from the resource schema.
 *
 * An override replaces the projection outright — it is not merged with
 * it. A field the resource schema hides via `dto: { response: false }`
 * is exposed again if the override schema declares it; that is the same
 * explicit opt-in `defineResource` has when an app passes its own schema.
 */
export interface ZodOperationSchemas {
  /**
   * Request body schema. Only valid on operations that HAVE a request
   * body (`create`, `update`, `replace`); `zodResource` throws otherwise
   * rather than accept a value core would ignore.
   */
  readonly input?: z.ZodObject;
  /**
   * Response schema for the single-item body. Only valid on operations
   * that HAVE a response body — `delete` / `restore` need
   * `returnDeleted` / `returnRestored` (on a hard delete too), otherwise
   * they answer `204` and the override would be silently dropped.
   */
  readonly output?: z.ZodObject;
  /**
   * Reject unknown body keys with `400` instead of silently stripping
   * them (issue #79).
   *
   * A plain `z.object` drops undeclared keys during parse, so a client
   * sending `{ "modelId": "x", "unexpected": 1 }` gets `201` and the
   * extra key vanishes — the client believes a strict API accepted it.
   * With `strictInput: true` the effective input schema (the derived
   * projection, or the `input` override) is compiled with `.strict()`,
   * unknown keys become validation issues, and the response is `400`
   * naming the offending keys in `details`.
   *
   * Know exactly what you are buying:
   *
   * - **Top-level only.** zod's `.strict()` does not recurse: an
   *   unknown key inside a nested object is still stripped silently.
   * - **Declared-but-projected fields are REJECTED, not ignored.**
   *   `id`, `dateCreated`/`dateUpdated`, `version`, owner columns and
   *   `dto: { create: false }` fields are not in the input projection,
   *   so echoing a fetched row back into a strict `replace` is `400`.
   *   For owner columns that is a feature — a spoof attempt is named
   *   instead of silently overwritten — but a read-modify-write client
   *   must strip server-owned keys first.
   * - **OpenAPI:** the request body gains `additionalProperties: false`.
   * - On an `input` override, `input: z.object({...}).strict()` is the
   *   equivalent spelling; this flag exists for the DERIVED projection,
   *   which an app cannot otherwise reach.
   *
   * Opt-in per operation, not a resource default: stripping is the
   * long-standing generated-CRUD contract, and flipping it under
   * existing consumers would turn tolerated clients into broken ones.
   * Only valid on operations that HAVE a request body.
   */
  readonly strictInput?: boolean;
}

/**
 * Per-operation config accepted by the zod layer: everything
 * `defineResource` accepts for the operation, with `input` / `output`
 * re-typed as zod object schemas. `true` enables the operation with
 * defaults; `false` / omitted disables it.
 */
export type ZodOperationConfig = Omit<
  ResourceOperationConfig,
  'input' | 'output'
> &
  ZodOperationSchemas;
export type ZodDeleteOperationConfig = Omit<
  ResourceDeleteOperationConfig,
  'input' | 'output'
> &
  ZodOperationSchemas;
export type ZodRestoreOperationConfig = Omit<
  ResourceRestoreOperationConfig,
  'input' | 'output'
> &
  ZodOperationSchemas;

export interface ZodResourceOperations {
  readonly list?: boolean | ZodOperationConfig;
  readonly read?: boolean | ZodOperationConfig;
  readonly create?: boolean | ZodOperationConfig;
  readonly update?: boolean | ZodOperationConfig;
  readonly replace?: boolean | ZodOperationConfig;
  readonly delete?: boolean | ZodDeleteOperationConfig;
  readonly restore?: boolean | ZodRestoreOperationConfig;
}

const DEFAULT_OPERATIONS: ZodResourceOperations = {
  list: true,
  read: true,
  create: true,
  update: true,
  delete: true,
};

export function normalizeOperations(
  operations: readonly ZodCrudOperation[] | ZodResourceOperations | undefined,
): ZodResourceOperations {
  if (operations === undefined) {
    return DEFAULT_OPERATIONS;
  }
  if (Array.isArray(operations)) {
    return Object.fromEntries(
      (operations as readonly ZodCrudOperation[]).map((op) => [op, true]),
    );
  }
  return operations as ZodResourceOperations;
}

export function opConfig<T extends object>(
  value: boolean | T | undefined,
): T | Record<string, never> {
  return typeof value === 'object' ? value : {};
}

/**
 * Per-operation config with the zod-only keys removed. `input` /
 * `output` / `strictInput` are consumed by the compiler, which names the
 * schemas and re-attaches them; dropping them here keeps a raw override
 * from reaching core unnamed.
 */
export function zodOpConfig<T extends ZodOperationConfig>(
  value: boolean | T | undefined,
): Omit<ResourceOperationConfig, 'input' | 'output' | 'paginated'> {
  const {
    input: _input,
    output: _output,
    strictInput: _strictInput,
    ...config
  } = opConfig(value);
  return config;
}
