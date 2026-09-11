import { StorageErrorCode, normalizeStorageError } from '../storage.error.js';
import type { StorageBulkError, StorageBulkOptions } from '../storage.types.js';

export interface SettleManyResult<Result> {
  results: Result[];
  errors: StorageBulkError[];
}

function resolveConcurrency(options?: StorageBulkOptions): number {
  const concurrency = options?.concurrency ?? 8;
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw normalizeStorageError(
      new TypeError('concurrency must be a positive integer'),
      {
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
      },
    );
  }
  return concurrency;
}

export async function settleMany<Item, Result>(
  items: readonly Item[],
  keyOf: (item: Item) => string,
  worker: (item: Item) => Promise<Result>,
  options?: StorageBulkOptions,
): Promise<SettleManyResult<Result>> {
  const values = new Map<number, Result>();
  const failures = new Map<number, StorageBulkError>();

  if (options?.stopOnError) {
    for (const [index, item] of items.entries()) {
      try {
        values.set(index, await worker(item));
      } catch (error) {
        failures.set(index, {
          error: normalizeStorageError(error),
          key: keyOf(item),
        });
        break;
      }
    }
  } else {
    const concurrency = Math.min(resolveConcurrency(options), items.length);
    let nextIndex = 0;

    const runWorker = async (): Promise<void> => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        const item = items[index];
        if (item === undefined) {
          continue;
        }
        try {
          values.set(index, await worker(item));
        } catch (error) {
          failures.set(index, {
            error: normalizeStorageError(error),
            key: keyOf(item),
          });
        }
      }
    };

    await Promise.all(
      Array.from({ length: concurrency }, async () => runWorker()),
    );
  }

  return {
    errors: [...failures.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, error]) => error),
    results: [...values.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, value]) => value),
  };
}
