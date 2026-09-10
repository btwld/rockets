export const StorageErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  READ_ONLY: 'READ_ONLY',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  ABORTED: 'ABORTED',
  TIMEOUT: 'TIMEOUT',
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  PROVIDER: 'PROVIDER',
} as const;

export type StorageErrorCode =
  (typeof StorageErrorCode)[keyof typeof StorageErrorCode];

const STORAGE_ERROR_BRAND = Symbol.for(
  '@concepta/rockets-storage/StorageError',
);

function isStorageErrorCode(value: unknown): value is StorageErrorCode {
  return Object.values(StorageErrorCode).includes(value as StorageErrorCode);
}

export interface StorageErrorOptions {
  code: StorageErrorCode;
  store?: string;
  operation?: string;
  key?: string;
  aborted?: boolean;
  timedOut?: boolean;
  permanent?: boolean;
  cause?: unknown;
}

export class StorageError extends Error {
  declare readonly [STORAGE_ERROR_BRAND]: true;
  readonly code: StorageErrorCode;
  readonly store: string | undefined;
  readonly operation: string | undefined;
  readonly key: string | undefined;
  readonly aborted: boolean;
  readonly timedOut: boolean;
  readonly permanent: boolean;
  declare readonly cause?: unknown;

  constructor(message: string, options: StorageErrorOptions) {
    super(message);
    Object.defineProperty(this, 'cause', {
      configurable: true,
      enumerable: false,
      value: options.cause,
      writable: false,
    });
    Object.defineProperty(this, STORAGE_ERROR_BRAND, {
      configurable: false,
      enumerable: false,
      value: true,
      writable: false,
    });
    this.name = 'StorageError';
    this.code = options.code;
    this.store = options.store;
    this.operation = options.operation;
    this.key = options.key;
    this.aborted = options.aborted === true;
    this.timedOut = options.timedOut === true;
    this.permanent = options.permanent === true;
  }
}

export function isStorageError(error: unknown): error is StorageError {
  if (error instanceof StorageError) {
    return true;
  }
  if (!(error instanceof Error) || error.name !== 'StorageError') {
    return false;
  }

  try {
    const candidate = error as Error & {
      readonly [STORAGE_ERROR_BRAND]?: unknown;
      readonly aborted?: unknown;
      readonly code?: unknown;
      readonly key?: unknown;
      readonly operation?: unknown;
      readonly permanent?: unknown;
      readonly store?: unknown;
      readonly timedOut?: unknown;
    };
    const hasCompatibleBrand =
      candidate[STORAGE_ERROR_BRAND] === true ||
      candidate[STORAGE_ERROR_BRAND] === undefined;
    return (
      hasCompatibleBrand &&
      isStorageErrorCode(candidate.code) &&
      typeof candidate.aborted === 'boolean' &&
      typeof candidate.timedOut === 'boolean' &&
      typeof candidate.permanent === 'boolean' &&
      (candidate.store === undefined || typeof candidate.store === 'string') &&
      (candidate.operation === undefined ||
        typeof candidate.operation === 'string') &&
      (candidate.key === undefined || typeof candidate.key === 'string')
    );
  } catch {
    return false;
  }
}

/**
 * Drivers sanitize their errors and deliberately leave `store`, `operation`,
 * and `key` unset so the calling client can fill in the context it owns.
 * Fields the driver did set are authoritative and are never overwritten.
 */
function withStorageErrorContext(
  error: StorageError,
  context: Pick<StorageErrorOptions, 'key' | 'operation' | 'store'>,
): StorageError {
  const key = error.key ?? context.key;
  const operation = error.operation ?? context.operation;
  const store = error.store ?? context.store;
  if (
    key === error.key &&
    operation === error.operation &&
    store === error.store
  ) {
    return error;
  }

  const contextual = new StorageError(error.message, {
    aborted: error.aborted,
    cause: error.cause,
    code: error.code,
    permanent: error.permanent,
    timedOut: error.timedOut,
    ...(key !== undefined && { key }),
    ...(operation !== undefined && { operation }),
    ...(store !== undefined && { store }),
  });
  if (error.stack !== undefined) {
    contextual.stack = error.stack;
  }
  return contextual;
}

export function normalizeStorageError(
  error: unknown,
  options: Omit<StorageErrorOptions, 'code' | 'cause'> & {
    code?: StorageErrorCode;
  } = {},
): StorageError {
  if (isStorageError(error)) {
    return withStorageErrorContext(error, options);
  }

  const message = error instanceof Error ? error.message : String(error);

  return new StorageError(message, {
    ...options,
    cause: error,
    code: options.code ?? StorageErrorCode.PROVIDER,
  });
}
