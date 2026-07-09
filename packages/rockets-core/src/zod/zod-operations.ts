import type { ClassTransformOptions } from 'class-transformer';
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
 * Per-operation config accepted by the zod layer: everything
 * `defineResource` accepts for the operation EXCEPT `input` / `output`,
 * which are owned by the schema compilation. `true` enables the
 * operation with defaults; `false` / omitted disables it.
 */
export type ZodOperationConfig = Omit<
  ResourceOperationConfig,
  'input' | 'output'
>;
export type ZodDeleteOperationConfig = Omit<
  ResourceDeleteOperationConfig,
  'input' | 'output'
>;
export type ZodRestoreOperationConfig = Omit<
  ResourceRestoreOperationConfig,
  'input' | 'output'
>;

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
 * Outbound serialization for zod DTO responses. The module default pair
 * (`strategy: 'excludeAll'` + `excludeExtraneousValues`) makes
 * class-transformer SKIP custom `@Transform`s on `classToPlain` and
 * recursively empty free-form objects (json columns). Whitelisting
 * already happened on the way IN (`toInstance` keeps the excludeAll
 * defaults); the way out only needs prefix hygiene.
 */
const ZOD_TO_PLAIN_OPTIONS: ClassTransformOptions = {
  strategy: 'exposeAll',
  excludeExtraneousValues: false,
  excludePrefixes: ['_', '__'],
};

/**
 * Per-operation config with the zod outbound serialization installed,
 * preserving any consumer-provided `responseOverride` keys (theirs win).
 */
export function zodOpConfig<T extends ZodOperationConfig>(
  value: boolean | T | undefined,
): ResourceOperationConfig {
  const config: T | Record<string, never> = opConfig(value);
  return {
    ...config,
    responseOverride: {
      ...config.responseOverride,
      serialization: {
        toPlainOptions: ZOD_TO_PLAIN_OPTIONS,
        ...config.responseOverride?.serialization,
      },
    },
  };
}
