import { settleMany } from './internal/settle-many.js';
import { isCanonicalStorageEtag } from './storage-etag.js';
import {
  StorageError,
  StorageErrorCode,
  normalizeStorageError,
} from './storage.error.js';
import type { StorageErrorOptions } from './storage.error.js';
import type { StorageDriver } from './storage.driver.js';
import type {
  StorageBody,
  StorageBufferedDownloadOptions,
  StorageBulkOptions,
  StorageCapabilities,
  StorageConditionalDeleteOptions,
  StorageConditionalReadOptions,
  StorageConditionalUploadOptions,
  StorageDeleteManyResult,
  StorageDownloadManyResult,
  StorageDownloadOptions,
  StorageExistsManyResult,
  StorageHeadManyResult,
  StorageListOptions,
  StorageListResult,
  StorageObject,
  StorageObjectMetadata,
  StorageOperationContext,
  StorageOperationOptions,
  StoragePlugin,
  StoragePromotionOptions,
  StorageSearchOptions,
  StorageSignedDownloadOptions,
  StorageSignedUpload,
  StorageSignedUploadOptions,
  StorageUploadManyItem,
  StorageUploadManyOptions,
  StorageUploadManyResult,
  StorageUploadOptions,
  StorageUploadResult,
} from './storage.types.js';

export const DEFAULT_BUFFER_LIMIT = 10 * 1024 * 1024;

type BulkOperationOptions = StorageBulkOptions & StorageOperationOptions;
type DownloadManyOptions = StorageBulkOptions & StorageDownloadOptions;

function assertKey(key: string, label = 'key'): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new StorageError(`${label} must be a non-empty string.`, {
      code: StorageErrorCode.INVALID_ARGUMENT,
      permanent: true,
    });
  }
}

type StorageErrorContext = Pick<
  StorageErrorOptions,
  'key' | 'operation' | 'store'
>;

function invalidArgument(
  message: string,
  context: StorageErrorContext = {},
): never {
  throw new StorageError(message, {
    ...context,
    code: StorageErrorCode.INVALID_ARGUMENT,
    permanent: true,
  });
}

function assertPositiveSafeInteger(
  value: number | undefined,
  label: string,
  context?: StorageErrorContext,
): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    invalidArgument(`${label} must be a positive safe integer.`, context);
  }
}

function assertDownloadOptions(options?: StorageDownloadOptions): void {
  const range = options?.range;
  if (range === undefined) {
    return;
  }
  if (!Number.isSafeInteger(range.start) || range.start < 0) {
    invalidArgument('range.start must be a non-negative safe integer.');
  }
  if (
    range.end !== undefined &&
    (!Number.isSafeInteger(range.end) || range.end < range.start)
  ) {
    invalidArgument(
      'range.end must be a safe integer greater than or equal to range.start.',
    );
  }
}

function assertListOptions(options?: StorageListOptions): void {
  if (options?.delimiter !== undefined && options.delimiter.length === 0) {
    invalidArgument('delimiter must be a non-empty string.');
  }
  assertPositiveSafeInteger(options?.limit, 'limit');
}

function assertSearchOptions(options?: StorageSearchOptions): void {
  assertPositiveSafeInteger(options?.limit, 'limit');
  assertPositiveSafeInteger(options?.maxResults, 'maxResults');
}

function assertSignedDownloadOptions(
  options: StorageSignedDownloadOptions | undefined,
  context: StorageErrorContext,
): void {
  assertPositiveSafeInteger(options?.expiresIn, 'expiresIn', context);
  if (
    options?.responseContentDisposition !== undefined &&
    options.responseContentDisposition.length === 0
  ) {
    invalidArgument(
      'responseContentDisposition must be a non-empty string.',
      context,
    );
  }
}

function assertSignedUploadOptions(
  options: StorageSignedUploadOptions,
  context: StorageErrorContext,
): void {
  assertPositiveSafeInteger(options.expiresIn, 'expiresIn', context);
  assertPositiveSafeInteger(options.maxSize, 'maxSize', context);
  if (
    options.minSize !== undefined &&
    (!Number.isSafeInteger(options.minSize) || options.minSize < 0)
  ) {
    invalidArgument('minSize must be a non-negative safe integer.', context);
  }
  if (
    options.minSize !== undefined &&
    options.maxSize !== undefined &&
    options.minSize > options.maxSize
  ) {
    invalidArgument('minSize cannot be greater than maxSize.', context);
  }
}

function operationOptions(
  options?: BulkOperationOptions,
): StorageOperationOptions | undefined {
  if (options === undefined) {
    return undefined;
  }
  return {
    ...(options.retries !== undefined && { retries: options.retries }),
    ...(options.signal !== undefined && { signal: options.signal }),
    ...(options.timeout !== undefined && { timeout: options.timeout }),
  };
}

function downloadOptions(
  options?: DownloadManyOptions,
): StorageDownloadOptions | undefined {
  if (options === undefined) {
    return undefined;
  }
  return {
    ...operationOptions(options),
    ...(options.range !== undefined && { range: options.range }),
  };
}

async function collectBody(
  object: StorageObject,
  maxBytes: number,
): Promise<Uint8Array> {
  if (maxBytes !== Infinity && (!Number.isFinite(maxBytes) || maxBytes < 0)) {
    await object.body.cancel().catch(() => undefined);
    throw new StorageError(
      'maxBytes must be a non-negative finite number or Infinity.',
      {
        code: StorageErrorCode.INVALID_ARGUMENT,
        key: object.key,
        permanent: true,
      },
    );
  }

  if (maxBytes !== Infinity && object.size > maxBytes) {
    await object.body.cancel().catch(() => undefined);
    throw new StorageError(
      `Object "${object.key}" is ${object.size} bytes, exceeding the ${maxBytes}-byte buffer limit.`,
      {
        code: StorageErrorCode.LIMIT_EXCEEDED,
        key: object.key,
        permanent: true,
      },
    );
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = object.body.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (maxBytes !== Infinity && total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new StorageError(
          `Object "${object.key}" exceeded the ${maxBytes}-byte buffer limit while downloading.`,
          {
            code: StorageErrorCode.LIMIT_EXCEEDED,
            key: object.key,
            permanent: true,
          },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export interface StorageFileHandle {
  readonly key: string;
  upload(
    body: StorageBody,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResult>;
  uploadConditional(
    body: StorageBody,
    options: StorageConditionalUploadOptions,
  ): Promise<StorageUploadResult>;
  download(options?: StorageDownloadOptions): Promise<StorageObject>;
  downloadConditional(
    options: StorageConditionalReadOptions,
  ): Promise<StorageObject>;
  bytes(options?: StorageBufferedDownloadOptions): Promise<Uint8Array>;
  text(options?: StorageBufferedDownloadOptions): Promise<string>;
  head(options?: StorageOperationOptions): Promise<StorageObjectMetadata>;
  exists(options?: StorageOperationOptions): Promise<boolean>;
  delete(options?: StorageOperationOptions): Promise<void>;
  deleteConditional(options: StorageConditionalDeleteOptions): Promise<void>;
  signDownload(options?: StorageSignedDownloadOptions): Promise<string>;
  signUpload(options: StorageSignedUploadOptions): Promise<StorageSignedUpload>;
  copyTo(
    destinationKey: string,
    options?: StorageOperationOptions,
  ): Promise<void>;
  moveTo(
    destinationKey: string,
    options?: StorageOperationOptions,
  ): Promise<void>;
  /** Conditionally copies this staged object and deliberately retains it. */
  promoteTo(
    destinationKey: string,
    options: StoragePromotionOptions,
  ): Promise<void>;
}

export class StorageClient {
  readonly #driver: StorageDriver;
  readonly #plugins: readonly StoragePlugin[];
  #closed = false;

  constructor(
    readonly name: string,
    driver: StorageDriver,
    plugins: readonly StoragePlugin[] = [],
  ) {
    assertKey(name, 'store name');
    this.#driver = driver;
    this.#plugins = [...plugins];
  }

  get driverName(): string {
    return this.#driver.name;
  }

  get capabilities(): Readonly<StorageCapabilities> {
    return this.#driver.capabilities;
  }

  file(key: string): StorageFileHandle {
    assertKey(key);
    return {
      copyTo: (destinationKey, options) =>
        this.copy(key, destinationKey, options),
      delete: (options) => this.delete(key, options),
      deleteConditional: (options) => this.deleteConditional(key, options),
      download: (options) => this.downloadStream(key, options),
      downloadConditional: (options) => this.downloadConditional(key, options),
      exists: (options) => this.exists(key, options),
      head: (options) => this.head(key, options),
      key,
      moveTo: (destinationKey, options) =>
        this.move(key, destinationKey, options),
      promoteTo: (destinationKey, options) =>
        this.promote(key, destinationKey, options),
      signDownload: (options) => this.signDownload(key, options),
      signUpload: (options) => this.signUpload(key, options),
      bytes: (options) => this.downloadBytes(key, options),
      text: (options) => this.downloadText(key, options),
      upload: (body, options) => this.upload(key, body, options),
      uploadConditional: (body, options) =>
        this.uploadConditional(key, body, options),
    };
  }

  upload(
    key: string,
    body: StorageBody,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResult> {
    assertKey(key);
    return this.#execute({ key, operation: 'upload', store: this.name }, () =>
      this.#driver.upload(key, body, options),
    );
  }

  uploadConditional(
    key: string,
    body: StorageBody,
    options: StorageConditionalUploadOptions,
  ): Promise<StorageUploadResult> {
    assertKey(key);
    const condition = options.condition;
    if (
      condition === undefined ||
      (condition.type !== 'create' && condition.type !== 'replace')
    ) {
      invalidArgument('condition.type must be "create" or "replace".');
    }
    if (
      condition.type === 'replace' &&
      !isCanonicalStorageEtag(condition.etag)
    ) {
      invalidArgument('condition.etag must be a canonical storage ETag.');
    }

    const capability =
      condition.type === 'create'
        ? this.#driver.capabilities.conditionalCreate
        : this.#driver.capabilities.conditionalReplace;
    const uploadConditional = this.#driver.uploadConditional;
    const multipartRequested =
      options.multipart !== undefined && options.multipart !== false;
    const multipartCapability =
      this.#driver.capabilities.conditionalMultipartCompletion;
    const multipartSupported =
      !multipartRequested ||
      (condition.type === 'create'
        ? multipartCapability?.create === true
        : multipartCapability?.replace === true);
    if (
      capability === undefined ||
      !multipartSupported ||
      uploadConditional === undefined
    ) {
      throw new StorageError(
        `Store "${this.name}" does not support the requested conditional upload.`,
        {
          code: StorageErrorCode.NOT_SUPPORTED,
          key,
          operation: 'upload',
          permanent: true,
          store: this.name,
        },
      );
    }

    return this.#execute({ key, operation: 'upload', store: this.name }, () =>
      uploadConditional.call(this.#driver, key, body, options),
    );
  }

  downloadStream(
    key: string,
    options?: StorageDownloadOptions,
  ): Promise<StorageObject> {
    assertKey(key);
    assertDownloadOptions(options);
    return this.#execute({ key, operation: 'download', store: this.name }, () =>
      this.#driver.download(key, options),
    );
  }

  downloadConditional(
    key: string,
    options: StorageConditionalReadOptions,
  ): Promise<StorageObject> {
    assertKey(key);
    assertDownloadOptions(options);
    if (
      options === undefined ||
      options.condition === undefined ||
      typeof options.condition !== 'object' ||
      options.condition === null
    ) {
      invalidArgument('conditional read requires a condition object.');
    }
    const { etag, version } = options.condition;
    if (etag !== undefined && !isCanonicalStorageEtag(etag)) {
      invalidArgument('condition.etag must be a canonical storage ETag.');
    }
    if (
      version !== undefined &&
      (typeof version !== 'string' || version.length === 0)
    ) {
      invalidArgument('condition.version must be a non-empty string.');
    }
    if (etag === undefined && version === undefined) {
      invalidArgument('conditional read requires an etag, version, or both.');
    }

    const capability = this.#driver.capabilities.conditionalRead;
    const downloadConditional = this.#driver.downloadConditional;
    if (
      downloadConditional === undefined ||
      capability === undefined ||
      (etag !== undefined && !capability.etag) ||
      (version !== undefined && !capability.version)
    ) {
      throw new StorageError(
        `Store "${this.name}" does not support the requested conditional read.`,
        {
          code: StorageErrorCode.NOT_SUPPORTED,
          key,
          operation: 'download',
          permanent: true,
          store: this.name,
        },
      );
    }

    return this.#execute({ key, operation: 'download', store: this.name }, () =>
      downloadConditional.call(this.#driver, key, options),
    );
  }

  async downloadBytes(
    key: string,
    options?: StorageBufferedDownloadOptions,
  ): Promise<Uint8Array> {
    const { maxBytes = DEFAULT_BUFFER_LIMIT, ...download } = options ?? {};
    const object = await this.downloadStream(key, download);
    return collectBody(object, maxBytes);
  }

  async downloadText(
    key: string,
    options?: StorageBufferedDownloadOptions,
  ): Promise<string> {
    return new TextDecoder().decode(await this.downloadBytes(key, options));
  }

  async downloadJson<Result = unknown>(
    key: string,
    options?: StorageBufferedDownloadOptions,
  ): Promise<Result> {
    const text = await this.downloadText(key, options);
    try {
      return JSON.parse(text) as Result;
    } catch (error) {
      throw new StorageError(`Object "${key}" does not contain valid JSON.`, {
        cause: error,
        code: StorageErrorCode.INVALID_ARGUMENT,
        key,
        operation: 'download',
        permanent: true,
        store: this.name,
      });
    }
  }

  head(
    key: string,
    options?: StorageOperationOptions,
  ): Promise<StorageObjectMetadata> {
    assertKey(key);
    return this.#execute({ key, operation: 'head', store: this.name }, () =>
      this.#driver.head(key, options),
    );
  }

  exists(key: string, options?: StorageOperationOptions): Promise<boolean> {
    assertKey(key);
    return this.#execute({ key, operation: 'exists', store: this.name }, () =>
      this.#driver.exists(key, options),
    );
  }

  delete(key: string, options?: StorageOperationOptions): Promise<void> {
    assertKey(key);
    return this.#execute({ key, operation: 'delete', store: this.name }, () =>
      this.#driver.delete(key, options),
    );
  }

  deleteConditional(
    key: string,
    options: StorageConditionalDeleteOptions,
  ): Promise<void> {
    assertKey(key);
    if (
      options.condition === undefined ||
      !isCanonicalStorageEtag(options.condition.etag)
    ) {
      invalidArgument('condition.etag must be a canonical storage ETag.');
    }

    const capability = this.#driver.capabilities.conditionalDelete;
    const deleteConditional = this.#driver.deleteConditional;
    if (capability?.etag !== true || deleteConditional === undefined) {
      throw new StorageError(
        `Store "${this.name}" does not support conditional delete.`,
        {
          code: StorageErrorCode.NOT_SUPPORTED,
          key,
          operation: 'delete',
          permanent: true,
          store: this.name,
        },
      );
    }

    return this.#execute({ key, operation: 'delete', store: this.name }, () =>
      deleteConditional.call(this.#driver, key, options),
    );
  }

  copy(
    sourceKey: string,
    destinationKey: string,
    options?: StorageOperationOptions,
  ): Promise<void> {
    assertKey(sourceKey, 'source key');
    assertKey(destinationKey, 'destination key');
    return this.#execute(
      {
        from: sourceKey,
        operation: 'copy',
        store: this.name,
        to: destinationKey,
      },
      () => this.#driver.copy(sourceKey, destinationKey, options),
    );
  }

  move(
    sourceKey: string,
    destinationKey: string,
    options?: StorageOperationOptions,
  ): Promise<void> {
    assertKey(sourceKey, 'source key');
    assertKey(destinationKey, 'destination key');
    return this.#execute(
      {
        from: sourceKey,
        operation: 'move',
        store: this.name,
        to: destinationKey,
      },
      () => this.#driver.move(sourceKey, destinationKey, options),
    );
  }

  /**
   * Conditionally copies a staged object to a final key. This operation does
   * not delete the source; delete it after the application commit succeeds.
   */
  promote(
    sourceKey: string,
    destinationKey: string,
    options: StoragePromotionOptions,
  ): Promise<void> {
    assertKey(sourceKey, 'source key');
    assertKey(destinationKey, 'destination key');
    const sourceEtag = options.sourceEtag;
    const sourceVersion = options.sourceVersion;
    if (sourceEtag !== undefined && !isCanonicalStorageEtag(sourceEtag)) {
      invalidArgument('sourceEtag must be a canonical storage ETag.');
    }
    if (
      sourceVersion !== undefined &&
      (typeof sourceVersion !== 'string' || sourceVersion.length === 0)
    ) {
      invalidArgument('sourceVersion must be a non-empty string.');
    }
    const destination = options.destination;
    if (
      destination !== undefined &&
      (typeof destination !== 'object' ||
        destination === null ||
        (destination.type !== 'create' && destination.type !== 'replace'))
    ) {
      invalidArgument('destination.type must be "create" or "replace".');
    }
    if (
      sourceEtag === undefined &&
      sourceVersion === undefined &&
      destination === undefined
    ) {
      invalidArgument('promote requires a source or destination precondition.');
    }
    if (
      destination?.type === 'replace' &&
      !isCanonicalStorageEtag(destination.etag)
    ) {
      invalidArgument('destination.etag must be a canonical storage ETag.');
    }

    const sourceCapability = this.#driver.capabilities.conditionalCopySource;
    const destinationCapability =
      this.#driver.capabilities.conditionalCopyDestination;
    const promote = this.#driver.promote;
    if (
      promote === undefined ||
      (sourceEtag !== undefined && sourceCapability?.etag !== true) ||
      (sourceVersion !== undefined && sourceCapability?.version !== true) ||
      (destination?.type === 'create' &&
        destinationCapability?.create !== true) ||
      (destination?.type === 'replace' &&
        destinationCapability?.replace !== true) ||
      (destination !== undefined &&
        (sourceEtag !== undefined || sourceVersion !== undefined) &&
        destinationCapability?.atomicWithSource !== true)
    ) {
      throw new StorageError(
        `Store "${this.name}" does not support the requested conditional promotion.`,
        {
          code: StorageErrorCode.NOT_SUPPORTED,
          key: sourceKey,
          operation: 'promote',
          permanent: true,
          store: this.name,
        },
      );
    }

    return this.#execute(
      {
        from: sourceKey,
        operation: 'promote',
        store: this.name,
        to: destinationKey,
      },
      () => promote.call(this.#driver, sourceKey, destinationKey, options),
    );
  }

  list(options?: StorageListOptions): Promise<StorageListResult> {
    assertListOptions(options);
    return this.#execute({ operation: 'list', store: this.name }, () =>
      this.#driver.list(options),
    );
  }

  async *listAll(
    options?: StorageListOptions,
  ): AsyncGenerator<StorageObjectMetadata, void> {
    const { delimiter: _delimiter, ...walkOptions } = options ?? {};
    void _delimiter;
    let cursor = walkOptions.cursor;
    const seen = new Set<string>();

    do {
      const page = await this.list({
        ...walkOptions,
        ...(cursor !== undefined && { cursor }),
      });
      yield* page.items;
      cursor = page.cursor;
      if (cursor !== undefined) {
        if (seen.has(cursor)) {
          throw new StorageError(
            `Store "${this.name}" returned a repeated pagination cursor.`,
            {
              code: StorageErrorCode.PROVIDER,
              operation: 'list',
              permanent: true,
              store: this.name,
            },
          );
        }
        seen.add(cursor);
      }
    } while (cursor !== undefined);
  }

  search(
    pattern: string | RegExp,
    options?: StorageSearchOptions,
  ): AsyncIterable<StorageObjectMetadata> {
    assertSearchOptions(options);
    return this.#search(pattern, options);
  }

  async *#search(
    pattern: string | RegExp,
    options?: StorageSearchOptions,
  ): AsyncGenerator<StorageObjectMetadata, void> {
    const context: StorageOperationContext = {
      operation: 'search',
      store: this.name,
    };
    try {
      for (const plugin of this.#plugins) {
        await plugin.beforeOperation?.(context);
      }
      for await (const object of this.#driver.search(pattern, options)) {
        yield object;
      }
      for (const plugin of this.#plugins) {
        await plugin.afterOperation?.(context, undefined);
      }
    } catch (error) {
      const normalized = normalizeStorageError(error, {
        operation: 'search',
        store: this.name,
      });
      for (const plugin of this.#plugins) {
        try {
          await plugin.onError?.(context, normalized);
        } catch {
          // Preserve the original storage error.
        }
      }
      throw normalized;
    }
  }

  signDownload(
    key: string,
    options?: StorageSignedDownloadOptions,
  ): Promise<string> {
    assertKey(key);
    const context: StorageErrorContext = {
      key,
      operation: 'signDownload',
      store: this.name,
    };
    assertSignedDownloadOptions(options, context);
    // Signed-UPLOAD constraints are gated inside the S3 adapter, against a
    // provider profile that says which guarantees it can enforce. There is no
    // equivalent seam for downloads: `url()` is served by the files-sdk
    // adapter, and upstream documents that whether a signed URL honors
    // `expiresIn` is a per-provider detail no capability can infer. So the
    // gate lives here, on the capability the adapter declares, and it is
    // strict: an adapter that declares nothing cannot be asked for an expiry.
    // Only the S3 adapter declares it today — see issue for extending the
    // profile mechanism to the remaining verified providers.
    if (options?.expiresIn !== undefined) {
      const capabilities = this.#driver.capabilities;
      if (capabilities.signedDownloadPolicy?.expiresIn !== true) {
        throw new StorageError(
          `Store "${this.name}" cannot enforce signed-download expiresIn.`,
          {
            code: StorageErrorCode.NOT_SUPPORTED,
            key,
            operation: 'signDownload',
            permanent: true,
            store: this.name,
          },
        );
      }
      // The provider may enforce a ceiling in code and the adapter may declare
      // a documented one its signature format cannot exceed; the lower wins.
      const ceiling = Math.min(
        capabilities.signedDownload.maxExpiresIn ?? Infinity,
        capabilities.signedDownloadPolicy.maxExpiresIn ?? Infinity,
      );
      if (options.expiresIn > ceiling) {
        throw new StorageError(
          `Store "${this.name}" cannot sign a download expiring in more than ${ceiling} seconds.`,
          {
            code: StorageErrorCode.INVALID_ARGUMENT,
            key,
            operation: 'signDownload',
            permanent: true,
            store: this.name,
          },
        );
      }
    }
    return this.#execute(
      { key, operation: 'signDownload', store: this.name },
      () => this.#driver.signDownload(key, options),
    );
  }

  signUpload(
    key: string,
    options: StorageSignedUploadOptions,
  ): Promise<StorageSignedUpload> {
    assertKey(key);
    assertSignedUploadOptions(options, {
      key,
      operation: 'signUpload',
      store: this.name,
    });
    return this.#execute(
      { key, operation: 'signUpload', store: this.name },
      () => this.#driver.signUpload(key, options),
    );
  }

  async uploadMany(
    items: readonly StorageUploadManyItem[],
    options?: StorageUploadManyOptions,
  ): Promise<StorageUploadManyResult> {
    const settled = await settleMany(
      items,
      (item) => item.key,
      (item) =>
        this.upload(item.key, item.body, {
          ...operationOptions(options),
          ...(item.cacheControl !== undefined && {
            cacheControl: item.cacheControl,
          }),
          ...(item.contentType !== undefined && {
            contentType: item.contentType,
          }),
          ...(item.metadata !== undefined && { metadata: item.metadata }),
          ...(item.multipart !== undefined && {
            multipart: item.multipart,
          }),
          ...(options?.onProgress !== undefined && {
            onProgress: (progress) =>
              options.onProgress?.({ ...progress, key: item.key }),
          }),
        }),
      options,
    );

    return {
      uploaded: settled.results,
      ...(settled.errors.length > 0 && { errors: settled.errors }),
    };
  }

  async downloadMany(
    keys: readonly string[],
    options?: DownloadManyOptions,
  ): Promise<StorageDownloadManyResult> {
    const settled = await settleMany(
      keys,
      (key) => key,
      (key) => this.downloadStream(key, downloadOptions(options)),
      options,
    );
    return {
      downloaded: settled.results,
      ...(settled.errors.length > 0 && { errors: settled.errors }),
    };
  }

  async headMany(
    keys: readonly string[],
    options?: BulkOperationOptions,
  ): Promise<StorageHeadManyResult> {
    const settled = await settleMany(
      keys,
      (key) => key,
      (key) => this.head(key, operationOptions(options)),
      options,
    );
    return {
      objects: settled.results,
      ...(settled.errors.length > 0 && { errors: settled.errors }),
    };
  }

  async existsMany(
    keys: readonly string[],
    options?: BulkOperationOptions,
  ): Promise<StorageExistsManyResult> {
    const settled = await settleMany(
      keys,
      (key) => key,
      async (key) => ({ exists: await this.exists(key, options), key }),
      options,
    );
    const existing: string[] = [];
    const missing: string[] = [];
    for (const result of settled.results) {
      (result.exists ? existing : missing).push(result.key);
    }
    return {
      existing,
      missing,
      ...(settled.errors.length > 0 && { errors: settled.errors }),
    };
  }

  async deleteMany(
    keys: readonly string[],
    options?: BulkOperationOptions,
  ): Promise<StorageDeleteManyResult> {
    const settled = await settleMany(
      keys,
      (key) => key,
      async (key) => {
        await this.delete(key, operationOptions(options));
        return key;
      },
      options,
    );
    return {
      deleted: settled.results,
      ...(settled.errors.length > 0 && { errors: settled.errors }),
    };
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    await this.#driver.close?.();
  }

  async #execute<Result>(
    context: StorageOperationContext,
    operation: () => Promise<Result>,
  ): Promise<Result> {
    try {
      for (const plugin of this.#plugins) {
        await plugin.beforeOperation?.(context);
      }
      const result = await operation();
      for (const plugin of this.#plugins) {
        await plugin.afterOperation?.(context, result);
      }
      return result;
    } catch (error) {
      const normalized = normalizeStorageError(error, {
        ...(context.key !== undefined && { key: context.key }),
        operation: context.operation,
        store: this.name,
      });
      for (const plugin of this.#plugins) {
        try {
          await plugin.onError?.(context, normalized);
        } catch {
          // Preserve the original storage error.
        }
      }
      throw normalized;
    }
  }
}
