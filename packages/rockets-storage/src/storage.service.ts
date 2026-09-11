import { settleMany } from './internal/settle-many.js';
import { StorageClient } from './storage.client.js';
import { StorageError, StorageErrorCode } from './storage.error.js';
import { normalizeStorageName } from './storage.tokens.js';
import type {
  StorageBulkError,
  StorageObjectMetadata,
  StorageSyncCompare,
  StorageSyncOptions,
  StorageSyncProgress,
  StorageSyncResult,
  StorageTransferOptions,
  StorageTransferProgress,
  StorageTransferResult,
} from './storage.types.js';

const identity = (key: string): string => key;

function joinStorageKey(prefix: string | undefined, key: string): string {
  if (prefix === undefined || prefix.length === 0) {
    return key;
  }
  const normalizedPrefix = prefix.replace(/\/+$/u, '');
  for (const [label, value] of [
    ['destinationPrefix', normalizedPrefix],
    ['transformed destination key', key],
  ] as const) {
    if (
      value.length === 0 ||
      value.startsWith('/') ||
      value.includes('\\') ||
      value.includes('\0') ||
      value
        .split('/')
        .some(
          (segment) =>
            segment.length === 0 || segment === '.' || segment === '..',
        )
    ) {
      throw new StorageError(
        `${label} must be a canonical relative POSIX storage key.`,
        {
          code: StorageErrorCode.INVALID_ARGUMENT,
          permanent: true,
        },
      );
    }
  }
  return `${normalizedPrefix}/${key}`;
}

function assertDifferentStores(from: string, to: string): void {
  if (from === to) {
    throw new StorageError(
      'Cross-store transfer and sync require different source and destination stores.',
      {
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
        store: from,
      },
    );
  }
}

/**
 * ETags are opaque, per-driver tokens — the filesystem driver emits a
 * truncated sha1, S3 an md5 — so comparing them across two different drivers
 * can never match and an implicit `'etag'` sync would silently re-upload every
 * object on every run. Make the caller choose. Driver name is a conservative
 * discriminator: S3-compatible endpoints under different names do produce
 * comparable ETags, and those callers pass `compare` explicitly.
 */
function resolveSyncCompare(
  options: StorageSyncOptions,
  source: StorageClient,
  destination: StorageClient,
): StorageSyncCompare {
  if (options.compare !== undefined) {
    return options.compare;
  }
  if (source.driverName !== destination.driverName) {
    throw new StorageError(
      `Syncing "${source.driverName}" to "${destination.driverName}" requires an explicit compare: ETags are not comparable across drivers.`,
      {
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
        store: destination.name,
      },
    );
  }
  return 'etag';
}

function unchanged(
  source: StorageObjectMetadata,
  destination: StorageObjectMetadata,
  compare: StorageSyncCompare,
): boolean {
  if (typeof compare === 'function') {
    return compare(source, destination);
  }
  if (compare === 'size') {
    return source.size === destination.size;
  }
  return (
    source.size === destination.size &&
    source.etag !== undefined &&
    destination.etag !== undefined &&
    source.etag === destination.etag
  );
}

async function walk(
  client: StorageClient,
  options: {
    prefix?: string;
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<StorageObjectMetadata[]> {
  const objects: StorageObjectMetadata[] = [];
  for await (const object of client.listAll({
    ...(options.limit !== undefined && { limit: options.limit }),
    ...(options.prefix !== undefined && { prefix: options.prefix }),
    ...(options.signal !== undefined && { signal: options.signal }),
  })) {
    objects.push(object);
  }
  return objects;
}

export class StorageService {
  readonly #clients: ReadonlyMap<string, StorageClient>;

  constructor(
    clients: ReadonlyMap<string, StorageClient>,
    private readonly defaultName: string | null,
  ) {
    this.#clients = new Map(clients);
  }

  get names(): readonly string[] {
    return [...this.#clients.keys()].sort();
  }

  use(name?: string): StorageClient {
    const resolved =
      name === undefined ? this.defaultName : normalizeStorageName(name);

    if (resolved === null) {
      throw new StorageError(
        'No default storage store is configured; call storage.use(name).',
        {
          code: StorageErrorCode.INVALID_ARGUMENT,
          permanent: true,
        },
      );
    }

    const client = this.#clients.get(resolved);
    if (client === undefined) {
      const available = this.names;
      throw new StorageError(
        available.length === 0
          ? `Storage store "${resolved}" is not registered.`
          : `Storage store "${resolved}" is not registered. Available stores: ${available.join(
              ', ',
            )}.`,
        {
          code: StorageErrorCode.INVALID_ARGUMENT,
          permanent: true,
          store: resolved,
        },
      );
    }
    return client;
  }

  async transfer(
    options: StorageTransferOptions,
  ): Promise<StorageTransferResult> {
    const fromName = normalizeStorageName(options.from);
    const toName = normalizeStorageName(options.to);
    assertDifferentStores(fromName, toName);
    const source = this.use(fromName);
    const destination = this.use(toName);
    const transformKey = options.transformKey ?? identity;
    const overwrite = options.overwrite ?? true;
    const objects = await walk(source, options);
    const total = objects.length;
    let done = 0;
    const skipped = new Set<string>();

    const report = (
      key: string,
      status: StorageTransferProgress['status'],
    ): void => {
      done += 1;
      options.onProgress?.({ done, key, status, total });
    };

    const settled = await settleMany(
      objects,
      (object) => object.key,
      async (object) => {
        const destinationKey = transformKey(object.key);
        if (
          !overwrite &&
          (await destination.exists(destinationKey, {
            ...(options.signal !== undefined && {
              signal: options.signal,
            }),
          }))
        ) {
          skipped.add(object.key);
          report(object.key, 'skipped');
          return object.key;
        }

        const downloaded = await source.downloadStream(object.key, {
          ...(options.signal !== undefined && {
            signal: options.signal,
          }),
        });
        try {
          await destination.upload(destinationKey, downloaded.body, {
            contentType: downloaded.contentType,
            ...(downloaded.metadata !== undefined && {
              metadata: downloaded.metadata,
            }),
            ...(options.signal !== undefined && {
              signal: options.signal,
            }),
          });
        } catch (error) {
          if (!downloaded.body.locked) {
            await downloaded.body.cancel().catch(() => undefined);
          }
          throw error;
        }
        report(object.key, 'transferred');
        return object.key;
      },
      options,
    );

    const transferred: string[] = [];
    const skippedKeys: string[] = [];
    for (const key of settled.results) {
      (skipped.has(key) ? skippedKeys : transferred).push(key);
    }

    return {
      transferred,
      ...(skippedKeys.length > 0 && { skipped: skippedKeys }),
      ...(settled.errors.length > 0 && { errors: settled.errors }),
    };
  }

  async sync(options: StorageSyncOptions): Promise<StorageSyncResult> {
    const fromName = normalizeStorageName(options.from);
    const toName = normalizeStorageName(options.to);
    assertDifferentStores(fromName, toName);
    const source = this.use(fromName);
    const destination = this.use(toName);
    const transformKey = options.transformKey ?? identity;
    const destinationKeyOf = (key: string): string =>
      joinStorageKey(options.destinationPrefix, transformKey(key));
    const compare = resolveSyncCompare(options, source, destination);
    const sourceObjects = await walk(source, options);
    const destinationObjects = await walk(destination, {
      ...(options.destinationPrefix !== undefined
        ? { prefix: options.destinationPrefix }
        : options.prefix !== undefined
        ? { prefix: options.prefix }
        : {}),
      ...(options.limit !== undefined && { limit: options.limit }),
      ...(options.signal !== undefined && { signal: options.signal }),
    });
    const destinationIndex = new Map(
      destinationObjects.map((object) => [object.key, object]),
    );
    const desiredDestinationKeys = new Set(
      sourceObjects.map((object) => destinationKeyOf(object.key)),
    );
    const deleteKeys =
      options.prune ?? false
        ? destinationObjects
            .map((object) => object.key)
            .filter((key) => !desiredDestinationKeys.has(key))
        : [];

    const plannedUploads: string[] = [];
    const plannedSkips: string[] = [];
    for (const object of sourceObjects) {
      const existing = destinationIndex.get(destinationKeyOf(object.key));
      (existing && unchanged(object, existing, compare)
        ? plannedSkips
        : plannedUploads
      ).push(object.key);
    }

    if (options.dryRun) {
      return {
        uploaded: plannedUploads,
        skipped: plannedSkips,
        ...(options.prune && { deleted: deleteKeys }),
      };
    }

    const total =
      sourceObjects.length + (options.prune ? deleteKeys.length : 0);
    let done = 0;
    const report = (
      key: string,
      status: StorageSyncProgress['status'],
    ): void => {
      done += 1;
      options.onProgress?.({ done, key, status, total });
    };
    const skipped = new Set<string>();

    const settled = await settleMany(
      sourceObjects,
      (object) => object.key,
      async (object) => {
        const destinationKey = destinationKeyOf(object.key);
        const existing = destinationIndex.get(destinationKey);
        if (existing && unchanged(object, existing, compare)) {
          skipped.add(object.key);
          report(object.key, 'skipped');
          return object.key;
        }
        const downloaded = await source.downloadStream(object.key, {
          ...(options.signal !== undefined && {
            signal: options.signal,
          }),
        });
        try {
          await destination.upload(destinationKey, downloaded.body, {
            contentType: downloaded.contentType,
            ...(downloaded.metadata !== undefined && {
              metadata: downloaded.metadata,
            }),
            ...(options.signal !== undefined && {
              signal: options.signal,
            }),
          });
        } catch (error) {
          if (!downloaded.body.locked) {
            await downloaded.body.cancel().catch(() => undefined);
          }
          throw error;
        }
        report(object.key, 'uploaded');
        return object.key;
      },
      options,
    );

    const uploaded: string[] = [];
    const skippedKeys: string[] = [];
    for (const key of settled.results) {
      (skipped.has(key) ? skippedKeys : uploaded).push(key);
    }

    let deleted: string[] | undefined;
    let deleteErrors: StorageBulkError[] = [];
    const canPrune =
      options.prune && !(options.stopOnError && settled.errors.length > 0);
    if (canPrune) {
      const deleteResult = await destination.deleteMany(deleteKeys, {
        ...(options.concurrency !== undefined && {
          concurrency: options.concurrency,
        }),
        ...(options.signal !== undefined && { signal: options.signal }),
        ...(options.stopOnError !== undefined && {
          stopOnError: options.stopOnError,
        }),
      });
      deleted = deleteResult.deleted;
      deleteErrors = deleteResult.errors ?? [];
      for (const key of deleted) {
        report(key, 'deleted');
      }
    }

    const errors = [...settled.errors, ...deleteErrors];
    return {
      uploaded,
      skipped: skippedKeys,
      ...(options.prune && { deleted: deleted ?? [] }),
      ...(errors.length > 0 && { errors }),
    };
  }
}
