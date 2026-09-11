import { Readable } from 'node:stream';

import {
  Files,
  FilesError,
  handlers,
  type Adapter,
  type Body,
  type DownloadOptions,
  type FilesOptions,
  type FilesPlugin,
  type ListOptions,
  type OperationOptions,
  type RetryOptions,
  type SearchOptions,
  type SignUploadOptions,
  type StoredFile,
  type UploadOptions,
  type UploadResult,
  type UrlOptions,
} from 'files-sdk';

import {
  StorageError,
  StorageErrorCode,
  isStorageError,
} from '../storage.error.js';
import {
  isCanonicalStorageEtag,
  normalizeProviderStorageEtag,
} from '../storage-etag.js';
import type { StorageDriver } from '../storage.driver.js';
import type {
  StorageBody,
  StorageConditionalCopyDestinationCapability,
  StorageConditionalCopySourceCapability,
  StorageConditionalDeleteCapability,
  StorageConditionalDeleteOptions,
  StorageConditionalMultipartCompletionCapability,
  StorageConditionalReadCapability,
  StorageConditionalReadOptions,
  StorageConditionalUploadOptions,
  StorageConditionalWriteCapability,
  StorageDownloadOptions,
  StorageListOptions,
  StorageListResult,
  StorageObject,
  StorageObjectMetadata,
  StorageOperationOptions,
  StoragePhysicalKeyCapability,
  StoragePromotionOptions,
  StorageRetryOptions,
  StorageSearchOptions,
  StorageSignedUploadPolicyCapability,
  StorageSignedDownloadPolicyCapability,
  StorageSignedDownloadOptions,
  StorageSignedUpload,
  StorageSignedUploadOptions,
  StorageUploadOptions,
  StorageUploadResult,
} from '../storage.types.js';
import { getFilesSdkUploadControl } from '../storage-upload-control.js';

export type FilesSdkDriverOptions<AdapterType extends Adapter> =
  FilesOptions<AdapterType>;

/**
 * Interim compatibility gate until Files SDK exposes native conditional/CAS
 * verbs through the same operation pipeline as its generic data plane.
 */
function hasCallerFilesOperationPolicy<AdapterType extends Adapter>(
  options: FilesSdkDriverOptions<AdapterType>,
): boolean {
  const hooks = options.hooks;
  return (
    (options.plugins?.length ?? 0) > 0 ||
    typeof hooks?.onAction === 'function' ||
    typeof hooks?.onError === 'function' ||
    typeof hooks?.onRetry === 'function' ||
    (options.receipts !== undefined && options.receipts !== false)
  );
}

export type FilesSdkS3AdapterProvenance = 'native' | 'verified' | 'unverified';

const FILES_SDK_S3_RESERVED_EXTENSION_KEYS = [
  'conditionalCopyDestination',
  'conditionalCopySource',
  'conditionalCreate',
  'conditionalDelete',
  'conditionalMultipartCompletion',
  'conditionalRead',
  'conditionalReplace',
  'deleteConditional',
  'downloadConditional',
  'physicalKey',
  'promote',
  'signedDownloadPolicy',
  'signedUploadPolicy',
  'uploadConditional',
] as const;

const FILES_SDK_S3_AUTHORITY_KEYS = [
  ...FILES_SDK_S3_RESERVED_EXTENSION_KEYS,
  'bucket',
  'copy',
  'delete',
  'deleteMany',
  'download',
  'exists',
  'head',
  'list',
  'move',
  'reportsUploadProgress',
  'resumableUpload',
  'signedUploadUrl',
  'signedUrl',
  'supportsCacheControl',
  'supportsDelimiter',
  'supportsMetadata',
  'supportsRange',
  'supportsServerSideCopy',
  'upload',
  'url',
] as const;

type FilesSdkS3AuthorityKey = (typeof FILES_SDK_S3_AUTHORITY_KEYS)[number];

interface FilesSdkS3AuthoritySnapshotEntry {
  readonly present: boolean;
  readonly value: unknown;
}

type FilesSdkS3AuthoritySnapshot = Readonly<
  Record<FilesSdkS3AuthorityKey, FilesSdkS3AuthoritySnapshotEntry>
>;

interface FilesSdkS3AdapterProvenanceRecord {
  readonly provenance: FilesSdkS3AdapterProvenance;
  readonly surface: FilesSdkS3AuthoritySnapshot;
}

const s3AdapterProvenance = new WeakMap<
  object,
  FilesSdkS3AdapterProvenanceRecord
>();
const undecoratedS3Adapters = new WeakSet<object>();
const s3AdapterAuthority = new WeakMap<object, object>();
const s3MethodAuthority = new WeakMap<Function, object>();
const s3AuthorityState = new WeakMap<
  object,
  {
    readonly raw: object;
    readonly record?: FilesSdkS3AdapterProvenanceRecord;
  }
>();
const conflictingS3Authority = Symbol('conflictingS3Authority');

function adapterRawObject(adapter: Adapter): object | undefined {
  try {
    const raw = adapter.raw;
    return (typeof raw === 'object' && raw !== null) ||
      typeof raw === 'function'
      ? raw
      : undefined;
  } catch {
    return undefined;
  }
}

function s3AdapterAuthorityTokenOf(
  adapter: Adapter,
): object | typeof conflictingS3Authority | undefined {
  let resolved = s3AdapterAuthority.get(adapter);
  const consider = (token: object | undefined): boolean => {
    if (token === undefined) return true;
    if (resolved !== undefined && resolved !== token) return false;
    resolved = token;
    return true;
  };
  try {
    const candidate = adapter as unknown as Record<PropertyKey, unknown>;
    for (const key of FILES_SDK_S3_AUTHORITY_KEYS) {
      if (!(key in candidate)) continue;
      const value = candidate[key];
      if (
        typeof value === 'function' &&
        !consider(s3MethodAuthority.get(value))
      ) {
        return conflictingS3Authority;
      }
    }
    return resolved;
  } catch {
    return conflictingS3Authority;
  }
}

function bindS3AdapterAuthorityMethods(adapter: Adapter, token: object): void {
  const candidate = adapter as unknown as Record<PropertyKey, unknown>;
  for (const key of FILES_SDK_S3_AUTHORITY_KEYS) {
    if (!(key in candidate)) continue;
    const value = candidate[key];
    if (typeof value !== 'function') continue;
    const existing = s3MethodAuthority.get(value);
    if (existing !== undefined && existing !== token) {
      throw new TypeError('S3 adapter methods have conflicting authority.');
    }
    s3MethodAuthority.set(value, token);
  }
}

function attachS3AdapterAuthority(adapter: Adapter, raw: object): object {
  const existing = s3AdapterAuthorityTokenOf(adapter);
  if (existing === conflictingS3Authority) {
    throw new TypeError('S3 adapter authority is inconsistent.');
  }
  const token = existing ?? Object.freeze({});
  const state = s3AuthorityState.get(token);
  if (state !== undefined && state.raw !== raw) {
    throw new TypeError('S3 adapter authority raw client cannot be changed.');
  }
  if (state === undefined) s3AuthorityState.set(token, { raw });
  s3AdapterAuthority.set(adapter, token);
  bindS3AdapterAuthorityMethods(adapter, token);
  return token;
}

function setS3AdapterProvenance(
  target: object,
  adapter: Adapter,
  provenance: FilesSdkS3AdapterProvenance,
): FilesSdkS3AdapterProvenanceRecord {
  const existing = s3AdapterProvenanceOfRaw(target);
  if (existing !== undefined) {
    if (
      existing.provenance !== provenance ||
      mismatchedS3Authority(adapter, existing.surface) !== undefined
    ) {
      throw new TypeError('S3 adapter provenance cannot be changed.');
    }
    s3AdapterProvenance.set(target, existing);
    return existing;
  }
  const record = Object.freeze({
    provenance,
    surface: s3AuthoritySnapshot(adapter),
  });
  s3AdapterProvenance.set(target, record);
  return record;
}

function s3AdapterProvenanceOfRaw(
  raw: object,
): FilesSdkS3AdapterProvenanceRecord | undefined {
  return s3AdapterProvenance.get(raw);
}

function s3AuthoritySnapshot(adapter: Adapter): FilesSdkS3AuthoritySnapshot {
  const candidate = adapter as unknown as Record<PropertyKey, unknown>;
  return Object.freeze(
    Object.fromEntries(
      FILES_SDK_S3_AUTHORITY_KEYS.map((key) => {
        const present = key in candidate;
        return [
          key,
          Object.freeze({
            present,
            value: present ? candidate[key] : undefined,
          }),
        ];
      }),
    ) as Record<FilesSdkS3AuthorityKey, FilesSdkS3AuthoritySnapshotEntry>,
  );
}

function mismatchedS3Authority(
  adapter: Adapter,
  snapshot: FilesSdkS3AuthoritySnapshot,
): FilesSdkS3AuthorityKey | undefined {
  const candidate = adapter as unknown as Record<PropertyKey, unknown>;
  try {
    return FILES_SDK_S3_AUTHORITY_KEYS.find((key) => {
      const present = key in candidate;
      const expected = snapshot[key];
      return (
        present !== expected.present ||
        !Object.is(present ? candidate[key] : undefined, expected.value)
      );
    });
  } catch {
    return FILES_SDK_S3_AUTHORITY_KEYS[0];
  }
}

/** Rejects adapters already carrying reserved storage S3 extensions. */
export function assertFilesSdkS3AdapterHasNoReservedExtensions(
  adapter: Adapter,
): void {
  const reserved = filesSdkS3ReservedExtensionOf(adapter);
  if (reserved !== undefined) {
    throw new TypeError(
      `S3 adapter already defines reserved extension "${reserved}".`,
    );
  }
}

function filesSdkS3ReservedExtensionOf(
  adapter: Adapter,
): (typeof FILES_SDK_S3_RESERVED_EXTENSION_KEYS)[number] | undefined {
  const candidate = adapter as unknown as Record<PropertyKey, unknown>;
  try {
    return FILES_SDK_S3_RESERVED_EXTENSION_KEYS.find((key) => key in candidate);
  } catch {
    return FILES_SDK_S3_RESERVED_EXTENSION_KEYS[0];
  }
}

/** Records that an S3 adapter was constructed but not provider-decorated. */
export function markFilesSdkS3AdapterUndecorated(adapter: Adapter): void {
  const raw = adapterRawObject(adapter);
  if (raw === undefined) {
    throw new TypeError('S3 adapter must expose an object raw client.');
  }
  attachS3AdapterAuthority(adapter, raw);
  undecoratedS3Adapters.add(raw);
}

/** Records the provider verification state of one decorated S3 adapter. */
export function markFilesSdkS3AdapterProvenance(
  adapter: Adapter,
  provenance: FilesSdkS3AdapterProvenance,
): void {
  const raw = adapterRawObject(adapter);
  if (raw === undefined) {
    throw new TypeError('S3 adapter must expose an object raw client.');
  }
  markFilesSdkS3RawClientProvenance(raw, adapter, provenance);
}

/** Records final provider verification state on one stable raw S3 client. */
export function markFilesSdkS3RawClientProvenance(
  raw: object,
  adapter: Adapter,
  provenance: FilesSdkS3AdapterProvenance,
): void {
  const authority = attachS3AdapterAuthority(adapter, raw);
  const record = setS3AdapterProvenance(raw, adapter, provenance);
  s3AuthorityState.set(authority, { raw, record });
  bindS3AdapterAuthorityMethods(adapter, authority);
}

function isUndecoratedS3Raw(raw: object): boolean {
  return undecoratedS3Adapters.has(raw);
}

function isStructuralS3Raw(raw: object): boolean {
  try {
    const candidate = raw as {
      readonly config?: unknown;
      readonly send?: unknown;
    };
    return (
      typeof candidate.send === 'function' &&
      typeof candidate.config === 'object' &&
      candidate.config !== null &&
      (candidate.config as { readonly serviceId?: unknown }).serviceId === 'S3'
    );
  } catch {
    return false;
  }
}

/**
 * Optional adapter extension for providers that can conditionally copy an
 * immutable source identity. Plain files-sdk adapters remain fully supported.
 */
export interface FilesSdkConditionalCopyAdapter {
  readonly conditionalCopySource?: StorageConditionalCopySourceCapability;
  readonly conditionalCopyDestination?: StorageConditionalCopyDestinationCapability;
  promote(
    sourceKey: string,
    destinationKey: string,
    options: StoragePromotionOptions,
  ): Promise<void>;
}

/** Optional adapter extension for native compare-and-set uploads. */
export interface FilesSdkConditionalUploadAdapter {
  readonly conditionalCreate?: StorageConditionalWriteCapability;
  readonly conditionalReplace?: StorageConditionalWriteCapability;
  readonly conditionalMultipartCompletion?: StorageConditionalMultipartCompletionCapability;
  uploadConditional(
    key: string,
    body: Body,
    options: StorageConditionalUploadOptions,
  ): Promise<StorageUploadResult>;
}

/** Optional adapter extension for native compare-and-delete. */
export interface FilesSdkConditionalDeleteAdapter {
  readonly conditionalDelete: StorageConditionalDeleteCapability;
  deleteConditional(
    key: string,
    options: StorageConditionalDeleteOptions,
  ): Promise<void>;
}

/** Optional adapter extension for an exact observed-identity read. */
export interface FilesSdkConditionalReadAdapter {
  readonly conditionalRead: StorageConditionalReadCapability;
  downloadConditional(
    key: string,
    options: StorageConditionalReadOptions,
  ): Promise<StorageObject>;
}

/** Optional provider key budget, measured after the driver prefix is applied. */
export interface FilesSdkPhysicalKeyAdapter {
  readonly physicalKey: StoragePhysicalKeyCapability;
}

export interface FilesSdkSignedUploadPolicyAdapter {
  readonly signedUploadPolicy: StorageSignedUploadPolicyCapability;
}

export interface FilesSdkSignedDownloadPolicyAdapter {
  readonly signedDownloadPolicy: StorageSignedDownloadPolicyCapability;
}

function conditionalCopyAdapterOf(
  adapter: Adapter,
): FilesSdkConditionalCopyAdapter | undefined {
  if (
    typeof adapter !== 'object' ||
    adapter === null ||
    !('promote' in adapter)
  ) {
    return undefined;
  }
  const candidate = adapter as Adapter &
    Partial<FilesSdkConditionalCopyAdapter>;
  const source = candidate.conditionalCopySource;
  const destination = candidate.conditionalCopyDestination;
  if (
    (source === undefined && destination === undefined) ||
    (source !== undefined &&
      (typeof source.etag !== 'boolean' ||
        typeof source.version !== 'boolean')) ||
    (destination !== undefined &&
      (typeof destination.create !== 'boolean' ||
        typeof destination.replace !== 'boolean' ||
        typeof destination.atomicWithSource !== 'boolean')) ||
    typeof candidate.promote !== 'function'
  ) {
    return undefined;
  }
  return candidate as Adapter & FilesSdkConditionalCopyAdapter;
}

function conditionalUploadAdapterOf(
  adapter: Adapter,
): FilesSdkConditionalUploadAdapter | undefined {
  if (
    typeof adapter !== 'object' ||
    adapter === null ||
    !('uploadConditional' in adapter)
  ) {
    return undefined;
  }
  const candidate = adapter as Adapter &
    Partial<FilesSdkConditionalUploadAdapter>;
  const create = candidate.conditionalCreate;
  const replace = candidate.conditionalReplace;
  const multipart = candidate.conditionalMultipartCompletion;
  if (
    (create === undefined && replace === undefined) ||
    (create !== undefined && typeof create.resultEtag !== 'boolean') ||
    (replace !== undefined && typeof replace.resultEtag !== 'boolean') ||
    (multipart !== undefined &&
      (typeof multipart.create !== 'boolean' ||
        typeof multipart.replace !== 'boolean')) ||
    typeof candidate.uploadConditional !== 'function'
  ) {
    return undefined;
  }
  return candidate as Adapter & FilesSdkConditionalUploadAdapter;
}

function conditionalDeleteAdapterOf(
  adapter: Adapter,
): FilesSdkConditionalDeleteAdapter | undefined {
  if (
    typeof adapter !== 'object' ||
    adapter === null ||
    !('conditionalDelete' in adapter) ||
    !('deleteConditional' in adapter)
  ) {
    return undefined;
  }
  const candidate = adapter as Adapter &
    Partial<FilesSdkConditionalDeleteAdapter>;
  if (
    candidate.conditionalDelete === undefined ||
    typeof candidate.conditionalDelete.etag !== 'boolean' ||
    typeof candidate.deleteConditional !== 'function'
  ) {
    return undefined;
  }
  return candidate as Adapter & FilesSdkConditionalDeleteAdapter;
}

function conditionalReadAdapterOf(
  adapter: Adapter,
): FilesSdkConditionalReadAdapter | undefined {
  if (
    typeof adapter !== 'object' ||
    adapter === null ||
    !('conditionalRead' in adapter) ||
    !('downloadConditional' in adapter)
  ) {
    return undefined;
  }
  const candidate = adapter as Adapter &
    Partial<FilesSdkConditionalReadAdapter>;
  if (
    candidate.conditionalRead === undefined ||
    typeof candidate.conditionalRead.etag !== 'boolean' ||
    typeof candidate.conditionalRead.version !== 'boolean' ||
    typeof candidate.downloadConditional !== 'function'
  ) {
    return undefined;
  }
  return candidate as Adapter & FilesSdkConditionalReadAdapter;
}

function physicalKeyAdapterOf(
  adapter: Adapter,
): FilesSdkPhysicalKeyAdapter | undefined {
  if (
    typeof adapter !== 'object' ||
    adapter === null ||
    !('physicalKey' in adapter)
  ) {
    return undefined;
  }
  const candidate = adapter as Adapter & Partial<FilesSdkPhysicalKeyAdapter>;
  const maxBytes = candidate.physicalKey?.maxBytes;
  if (!Number.isSafeInteger(maxBytes) || (maxBytes ?? 0) <= 0) {
    return undefined;
  }
  return candidate as Adapter & FilesSdkPhysicalKeyAdapter;
}

function signedUploadPolicyAdapterOf(
  adapter: Adapter,
): FilesSdkSignedUploadPolicyAdapter | undefined {
  if (
    typeof adapter !== 'object' ||
    adapter === null ||
    !('signedUploadPolicy' in adapter)
  ) {
    return undefined;
  }
  const candidate = adapter as Adapter &
    Partial<FilesSdkSignedUploadPolicyAdapter>;
  const capability = candidate.signedUploadPolicy;
  if (
    capability === undefined ||
    typeof capability.contentType !== 'boolean' ||
    typeof capability.sizeRange !== 'boolean'
  ) {
    return undefined;
  }
  return candidate as Adapter & FilesSdkSignedUploadPolicyAdapter;
}

function signedDownloadPolicyAdapterOf(
  adapter: Adapter,
): FilesSdkSignedDownloadPolicyAdapter | undefined {
  if (
    typeof adapter !== 'object' ||
    adapter === null ||
    !('signedDownloadPolicy' in adapter)
  ) {
    return undefined;
  }
  const candidate = adapter as Adapter &
    Partial<FilesSdkSignedDownloadPolicyAdapter>;
  const capability = candidate.signedDownloadPolicy;
  if (capability === undefined || typeof capability.expiresIn !== 'boolean') {
    return undefined;
  }
  return candidate as Adapter & FilesSdkSignedDownloadPolicyAdapter;
}

interface FilesErrorLike {
  readonly name: string;
  readonly message: string;
  readonly code: FilesError['code'];
  readonly aborted: boolean;
  readonly timedOut: boolean;
  readonly permanent: boolean;
  readonly cause?: unknown;
}

function isFilesErrorCode(value: unknown): value is FilesError['code'] {
  return (
    value === 'NotFound' ||
    value === 'Unauthorized' ||
    value === 'Conflict' ||
    value === 'ReadOnly' ||
    value === 'Provider'
  );
}

function isFilesErrorLike(error: unknown): error is FilesErrorLike {
  if (error instanceof FilesError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }

  try {
    return (
      error.name === 'FilesError' &&
      typeof error.message === 'string' &&
      'code' in error &&
      isFilesErrorCode(error.code) &&
      'aborted' in error &&
      typeof error.aborted === 'boolean' &&
      'timedOut' in error &&
      typeof error.timedOut === 'boolean' &&
      'permanent' in error &&
      typeof error.permanent === 'boolean'
    );
  } catch {
    return false;
  }
}

function unwrapFilesError(error: FilesErrorLike): FilesErrorLike {
  const seen = new Set<FilesErrorLike>();
  let current = error;

  while (
    current.code === 'Provider' &&
    !current.aborted &&
    !current.timedOut &&
    !current.permanent &&
    isFilesErrorLike(current.cause) &&
    current.message === current.cause.message &&
    !seen.has(current.cause)
  ) {
    seen.add(current);
    current = current.cause;
  }

  return current;
}

const PUBLIC_PROVIDER_ERROR_MESSAGES: Readonly<
  Record<StorageErrorCode, string>
> = Object.freeze({
  [StorageErrorCode.NOT_FOUND]: 'Storage provider object was not found.',
  [StorageErrorCode.UNAUTHORIZED]:
    'Storage provider operation was unauthorized.',
  [StorageErrorCode.CONFLICT]:
    'Storage provider operation conflicted with current state.',
  [StorageErrorCode.READ_ONLY]: 'Storage provider is read-only.',
  [StorageErrorCode.INVALID_ARGUMENT]:
    'Storage provider rejected an invalid argument.',
  [StorageErrorCode.NOT_SUPPORTED]:
    'Storage provider operation is not supported.',
  [StorageErrorCode.ABORTED]: 'Storage provider operation was aborted.',
  [StorageErrorCode.TIMEOUT]: 'Storage provider operation timed out.',
  [StorageErrorCode.LIMIT_EXCEEDED]:
    'Storage provider operation exceeded a limit.',
  [StorageErrorCode.PROVIDER]: 'Storage provider operation failed.',
});

function sanitizedStorageError(error: StorageError): StorageError {
  return new StorageError(PUBLIC_PROVIDER_ERROR_MESSAGES[error.code], {
    aborted: error.aborted,
    code: error.code,
    permanent: error.permanent,
    timedOut: error.timedOut,
  });
}

export function mapFilesSdkError(error: unknown): StorageError {
  if (isStorageError(error)) return sanitizedStorageError(error);
  if (!isFilesErrorLike(error)) {
    return new StorageError('Storage provider operation failed.', {
      code: StorageErrorCode.PROVIDER,
    });
  }

  const filesError = unwrapFilesError(error);

  if (
    filesError.code === 'Provider' &&
    !filesError.aborted &&
    !filesError.timedOut &&
    !filesError.permanent &&
    isStorageError(filesError.cause) &&
    filesError.message === filesError.cause.message
  ) {
    return sanitizedStorageError(filesError.cause);
  }

  let code: StorageErrorCode;
  if (filesError.timedOut) {
    code = StorageErrorCode.TIMEOUT;
  } else if (filesError.aborted) {
    code = StorageErrorCode.ABORTED;
  } else {
    switch (filesError.code) {
      case 'NotFound':
        code = StorageErrorCode.NOT_FOUND;
        break;
      case 'Unauthorized':
        code = StorageErrorCode.UNAUTHORIZED;
        break;
      case 'Conflict':
        code = StorageErrorCode.CONFLICT;
        break;
      case 'ReadOnly':
        code = StorageErrorCode.READ_ONLY;
        break;
      case 'Provider':
        code = /(?:not supported|does not support|unsupported)/iu.test(
          filesError.message,
        )
          ? StorageErrorCode.NOT_SUPPORTED
          : StorageErrorCode.PROVIDER;
        break;
    }
  }

  return new StorageError(PUBLIC_PROVIDER_ERROR_MESSAGES[code], {
    aborted: filesError.aborted,
    code,
    permanent: filesError.permanent,
    timedOut: filesError.timedOut,
  });
}

function mapRetryOptions(
  retries: StorageRetryOptions | undefined,
): RetryOptions | undefined {
  if (retries === undefined || typeof retries === 'number') {
    return retries;
  }

  return {
    max: retries.max,
    ...(retries.backoff !== undefined && {
      backoff: ({ attempt, error }) =>
        retries.backoff?.({
          attempt,
          error: mapFilesSdkError(error),
        }) ?? 0,
    }),
  };
}

function storageRetryOptions(
  retries: RetryOptions | undefined,
): StorageRetryOptions | undefined {
  if (retries === undefined || typeof retries === 'number') {
    return retries;
  }
  return {
    max: retries.max,
    ...(retries.backoff !== undefined && {
      backoff: ({ attempt, error }) =>
        retries.backoff?.({
          attempt,
          error: new FilesError(
            error.code === StorageErrorCode.NOT_FOUND
              ? 'NotFound'
              : error.code === StorageErrorCode.UNAUTHORIZED
              ? 'Unauthorized'
              : error.code === StorageErrorCode.CONFLICT
              ? 'Conflict'
              : error.code === StorageErrorCode.READ_ONLY
              ? 'ReadOnly'
              : 'Provider',
            error.message,
            error,
            {
              aborted: error.aborted,
              permanent: error.permanent,
              timedOut: error.timedOut,
            },
          ),
        }) ?? 0,
    }),
  };
}

function operationOptions(
  options?: StorageOperationOptions,
): OperationOptions | undefined {
  if (options === undefined) {
    return undefined;
  }

  const retries = mapRetryOptions(options.retries);
  return {
    ...(retries !== undefined && { retries }),
    ...(options.signal !== undefined && { signal: options.signal }),
    ...(options.timeout !== undefined && { timeout: options.timeout }),
  };
}

async function* normalizeNodeChunks(
  source: Readable,
): AsyncGenerator<Uint8Array> {
  for await (const chunk of source) {
    if (typeof chunk === 'string') {
      yield new TextEncoder().encode(chunk);
      continue;
    }
    if (chunk instanceof Uint8Array) {
      yield chunk;
      continue;
    }
    throw new StorageError(
      'Node upload streams must yield strings or Uint8Array chunks.',
      {
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
      },
    );
  }
}

function mapBody(body: StorageBody): Body {
  if (body instanceof Readable) {
    return Readable.toWeb(
      Readable.from(normalizeNodeChunks(body)),
    ) as ReadableStream<Uint8Array>;
  }
  return body;
}

function normalizeDownloadStream(
  source: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined =
    source.getReader();

  const release = (): void => {
    reader?.releaseLock();
    reader = undefined;
  };

  return new ReadableStream<Uint8Array>({
    async cancel(reason) {
      const activeReader = reader;
      if (activeReader === undefined) {
        return;
      }
      try {
        await activeReader.cancel(reason);
      } catch (error) {
        throw mapFilesSdkError(error);
      } finally {
        release();
      }
    },
    async pull(controller) {
      const activeReader = reader;
      if (activeReader === undefined) {
        controller.close();
        return;
      }
      try {
        const result = await activeReader.read();
        if (result.done) {
          release();
          controller.close();
          return;
        }
        controller.enqueue(result.value);
      } catch (error) {
        release();
        controller.error(mapFilesSdkError(error));
      }
    },
  });
}

function uploadOptions(
  options?: StorageUploadOptions,
): UploadOptions | undefined {
  if (options === undefined) {
    return undefined;
  }
  return {
    ...operationOptions(options),
    ...(options.cacheControl !== undefined && {
      cacheControl: options.cacheControl,
    }),
    ...(options.contentType !== undefined && {
      contentType: options.contentType,
    }),
    ...(options.control !== undefined && {
      control: getFilesSdkUploadControl(options.control),
    }),
    ...(options.metadata !== undefined && { metadata: options.metadata }),
    ...(options.multipart !== undefined && {
      multipart: options.multipart,
    }),
    ...(options.onProgress !== undefined && {
      onProgress: options.onProgress,
    }),
  };
}

function downloadOptions(options?: StorageDownloadOptions): DownloadOptions {
  return {
    ...operationOptions(options),
    as: 'stream',
    ...(options?.range !== undefined && { range: options.range }),
  };
}

function listOptions(options?: StorageListOptions): ListOptions | undefined {
  if (options === undefined) {
    return undefined;
  }
  return {
    ...operationOptions(options),
    ...(options.cursor !== undefined && { cursor: options.cursor }),
    ...(options.delimiter !== undefined && { delimiter: options.delimiter }),
    ...(options.limit !== undefined && { limit: options.limit }),
    ...(options.prefix !== undefined && { prefix: options.prefix }),
  };
}

function searchOptions(
  options?: StorageSearchOptions,
): SearchOptions | undefined {
  if (options === undefined) {
    return undefined;
  }
  return {
    ...operationOptions(options),
    ...(options.caseInsensitive !== undefined && {
      caseInsensitive: options.caseInsensitive,
    }),
    ...(options.limit !== undefined && { limit: options.limit }),
    ...(options.match !== undefined && { match: options.match }),
    ...(options.maxResults !== undefined && {
      maxResults: options.maxResults,
    }),
    ...(options.prefix !== undefined && { prefix: options.prefix }),
  };
}

function signedDownloadOptions(
  options?: StorageSignedDownloadOptions,
): UrlOptions | undefined {
  if (options === undefined) {
    return undefined;
  }
  return {
    ...operationOptions(options),
    ...(options.expiresIn !== undefined && {
      expiresIn: options.expiresIn,
    }),
    ...(options.responseContentDisposition !== undefined && {
      responseContentDisposition: options.responseContentDisposition,
    }),
  };
}

function signedUploadOptions(
  options: StorageSignedUploadOptions,
): SignUploadOptions {
  return {
    ...operationOptions(options),
    expiresIn: options.expiresIn,
    ...(options.contentType !== undefined && {
      contentType: options.contentType,
    }),
    ...(options.maxSize !== undefined && { maxSize: options.maxSize }),
    ...(options.minSize !== undefined && { minSize: options.minSize }),
  };
}

function providerEtag(
  value: unknown,
  key: string,
  operation: 'download' | 'head' | 'list' | 'search' | 'upload',
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const etag = normalizeProviderStorageEtag(value);
  if (etag === undefined) {
    throw new StorageError('Storage adapter returned an invalid ETag.', {
      code: StorageErrorCode.PROVIDER,
      key,
      operation,
      permanent: true,
    });
  }
  return etag;
}

function invalidConditionalEtag(
  label: string,
  key: string,
  operation: 'delete' | 'download' | 'promote' | 'upload',
): StorageError {
  return new StorageError(`${label} must be a canonical storage ETag.`, {
    code: StorageErrorCode.INVALID_ARGUMENT,
    key,
    operation,
    permanent: true,
  });
}

function metadataOf(
  file: StoredFile,
  operation: 'download' | 'head' | 'list' | 'search',
): StorageObjectMetadata {
  const etag = providerEtag(file.etag, file.key, operation);
  return {
    contentType: file.type,
    ...(etag !== undefined && { etag }),
    key: file.key,
    ...(file.lastModified !== undefined && {
      lastModified: new Date(file.lastModified),
    }),
    ...(file.metadata !== undefined && {
      metadata: { ...file.metadata },
    }),
    name: file.name,
    size: file.size,
  };
}

function uploadResultOf(result: UploadResult): StorageUploadResult {
  const etag = providerEtag(result.etag, result.key, 'upload');
  return {
    contentType: result.contentType,
    ...(etag !== undefined && { etag }),
    key: result.key,
    ...(result.lastModified !== undefined && {
      lastModified: new Date(result.lastModified),
    }),
    size: result.size,
  };
}

function normalizeFilesSdkPrefix(prefix: unknown): string {
  if (prefix === undefined) return '';
  if (typeof prefix !== 'string') {
    throw new StorageError('prefix must be a string.', {
      code: StorageErrorCode.INVALID_ARGUMENT,
      permanent: true,
    });
  }
  const normalized = prefix.replace(/^\/+|(?<!\/)\/+$/gu, '');
  if (normalized.length === 0 || normalized.includes('\0')) {
    throw new StorageError(
      'prefix must be a non-empty string without null bytes.',
      {
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
      },
    );
  }
  if (
    normalized.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new StorageError('prefix must not contain . or .. path segments.', {
      code: StorageErrorCode.INVALID_ARGUMENT,
      permanent: true,
    });
  }
  return normalized;
}

function physicalPluginKey(
  prefix: string,
  key: unknown,
): { readonly logicalKey: string; readonly physicalKey: string } {
  if (typeof key !== 'string' || key.length === 0) {
    throw new StorageError('The final plugin key must be a non-empty string.', {
      code: StorageErrorCode.INVALID_ARGUMENT,
      permanent: true,
    });
  }
  if (key.includes('\0')) {
    throw new StorageError(
      'The final plugin key must not contain null bytes.',
      {
        code: StorageErrorCode.INVALID_ARGUMENT,
        key,
        permanent: true,
      },
    );
  }
  const normalized = key.replace(/^\/+/u, '');
  if (
    normalized.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new StorageError(
      'The final plugin key must not contain . or .. path segments.',
      {
        code: StorageErrorCode.INVALID_ARGUMENT,
        key,
        permanent: true,
      },
    );
  }
  return {
    logicalKey: key,
    physicalKey: prefix.length === 0 ? key : `${prefix}/${normalized}`,
  };
}

function assertPhysicalPluginBudget(
  physicalKey: string,
  maxBytes: number | undefined,
  logicalKey?: string,
): void {
  if (
    maxBytes === undefined ||
    new TextEncoder().encode(physicalKey).byteLength <= maxBytes
  ) {
    return;
  }
  throw new StorageError(
    `The combined storage prefix and key exceed the provider's ${maxBytes}-byte physical-key limit.`,
    {
      code: StorageErrorCode.LIMIT_EXCEEDED,
      ...(logicalKey !== undefined && { key: logicalKey }),
      permanent: true,
    },
  );
}

function physicalKeyGuardPlugin(
  prefix: string,
  maxBytes: number | undefined,
): FilesPlugin {
  const assertKey = (key: unknown): string => {
    const resolved = physicalPluginKey(prefix, key);
    assertPhysicalPluginBudget(
      resolved.physicalKey,
      maxBytes,
      resolved.logicalKey,
    );
    return resolved.logicalKey;
  };
  const assertListOptions = (options: unknown): ListOptions | undefined => {
    if (
      options !== undefined &&
      (typeof options !== 'object' || options === null)
    ) {
      throw new StorageError(
        'The final plugin list options must be an object.',
        {
          code: StorageErrorCode.INVALID_ARGUMENT,
          permanent: true,
        },
      );
    }
    const listPrefix = (options as { readonly prefix?: unknown } | undefined)
      ?.prefix;
    if (listPrefix === undefined || listPrefix === '') {
      if (prefix.length > 0) {
        assertPhysicalPluginBudget(`${prefix}/`, maxBytes);
      }
      return options === undefined
        ? undefined
        : (() => {
            const { prefix: _prefix, ...rest } = options as ListOptions;
            return Object.freeze({
              ...rest,
              ...(listPrefix === '' && { prefix: listPrefix }),
            });
          })();
    }
    if (typeof listPrefix !== 'string') {
      throw new StorageError('The final plugin list prefix must be a string.', {
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
      });
    }
    const resolved = physicalPluginKey(prefix, listPrefix);
    assertPhysicalPluginBudget(
      resolved.physicalKey,
      maxBytes,
      resolved.logicalKey,
    );
    return Object.freeze({
      ...(options as ListOptions),
      prefix: resolved.logicalKey,
    });
  };
  return {
    name: '@concepta/rockets-storage/physical-key-guard',
    wrap: handlers({
      copy: (operation, next) => {
        const from = assertKey(operation.from);
        const to = assertKey(operation.to);
        return next(Object.freeze({ ...operation, from, to }));
      },
      delete: (operation, next) => {
        const key = assertKey(operation.key);
        return next(Object.freeze({ ...operation, key }));
      },
      download: (operation, next) => {
        const key = assertKey(operation.key);
        return next(Object.freeze({ ...operation, key }));
      },
      exists: (operation, next) => {
        const key = assertKey(operation.key);
        return next(Object.freeze({ ...operation, key }));
      },
      head: (operation, next) => {
        const key = assertKey(operation.key);
        return next(Object.freeze({ ...operation, key }));
      },
      list: (operation, next) => {
        const options = assertListOptions(operation.options);
        return next(
          Object.freeze({
            ...operation,
            ...(options !== undefined && { options }),
          }),
        );
      },
      move: (operation, next) => {
        const from = assertKey(operation.from);
        const to = assertKey(operation.to);
        return next(Object.freeze({ ...operation, from, to }));
      },
      signedUploadUrl: (operation, next) => {
        const key = assertKey(operation.key);
        return next(Object.freeze({ ...operation, key }));
      },
      upload: (operation, next) => {
        const key = assertKey(operation.key);
        return next(Object.freeze({ ...operation, key }));
      },
      url: (operation, next) => {
        const key = assertKey(operation.key);
        return next(Object.freeze({ ...operation, key }));
      },
    }),
  };
}

export class FilesSdkStorageDriver<AdapterType extends Adapter = Adapter>
  implements StorageDriver
{
  readonly #files: Files<AdapterType>;
  readonly #name: string;
  readonly #conditionalCopy: FilesSdkConditionalCopyAdapter | undefined;
  readonly #conditionalDelete: FilesSdkConditionalDeleteAdapter | undefined;
  readonly #conditionalRead: FilesSdkConditionalReadAdapter | undefined;
  readonly #conditionalUpload: FilesSdkConditionalUploadAdapter | undefined;
  readonly #conditionalOperationsBlockedByFilesPolicy: boolean;
  readonly #physicalKey: FilesSdkPhysicalKeyAdapter | undefined;
  readonly #prefix: string;
  readonly #readOnly: boolean;
  readonly #retries: StorageRetryOptions | undefined;
  readonly #signal: AbortSignal | undefined;
  readonly #timeout: number | undefined;
  readonly #signedUploadPolicy: FilesSdkSignedUploadPolicyAdapter | undefined;
  readonly #signedDownloadPolicy:
    | FilesSdkSignedDownloadPolicyAdapter
    | undefined;

  constructor(options: FilesSdkDriverOptions<AdapterType>) {
    const raw = adapterRawObject(options.adapter);
    const rawProvenance =
      raw === undefined ? undefined : s3AdapterProvenanceOfRaw(raw);
    const authorityToken = s3AdapterAuthorityTokenOf(options.adapter);
    const authorityState =
      typeof authorityToken === 'object'
        ? s3AuthorityState.get(authorityToken)
        : undefined;
    const authorityInvalid =
      authorityToken === conflictingS3Authority ||
      (authorityState !== undefined &&
        (authorityState.record === undefined ||
          raw === undefined ||
          (raw !== authorityState.raw &&
            rawProvenance !== authorityState.record)));
    const s3Provenance = authorityState?.record ?? rawProvenance;
    if (
      authorityInvalid ||
      (s3Provenance === undefined &&
        raw !== undefined &&
        (isUndecoratedS3Raw(raw) || isStructuralS3Raw(raw)))
    ) {
      throw new StorageError(
        'Raw S3 adapters must be configured with withS3Capabilities() or createS3StorageDriver().',
        {
          code: StorageErrorCode.INVALID_ARGUMENT,
          permanent: true,
        },
      );
    }
    const mismatchedAuthority =
      s3Provenance === undefined
        ? undefined
        : mismatchedS3Authority(options.adapter, s3Provenance.surface);
    if (mismatchedAuthority !== undefined) {
      throw new StorageError(
        `S3 adapter authority "${mismatchedAuthority}" does not match its verified provider profile.`,
        {
          code: StorageErrorCode.INVALID_ARGUMENT,
          permanent: true,
        },
      );
    }
    const adapterForFiles =
      s3Provenance === undefined
        ? options.adapter
        : (Object.freeze({ ...options.adapter }) as AdapterType);
    const copiedAuthorityMismatch =
      s3Provenance === undefined
        ? undefined
        : mismatchedS3Authority(adapterForFiles, s3Provenance.surface);
    if (copiedAuthorityMismatch !== undefined) {
      throw new StorageError(
        `S3 adapter authority "${copiedAuthorityMismatch}" changed while it was being bound.`,
        {
          code: StorageErrorCode.INVALID_ARGUMENT,
          permanent: true,
        },
      );
    }
    const readOnly =
      options.readonly === true || s3Provenance?.provenance === 'unverified';
    // Evaluate caller policy before appending the package-owned key guard below.
    this.#conditionalOperationsBlockedByFilesPolicy =
      hasCallerFilesOperationPolicy(options);
    // Files retains the hooks object by reference. Snapshot it so an initially
    // inactive object cannot be mutated after this compatibility decision and
    // start observing only ordinary operations.
    const hooks =
      options.hooks === undefined
        ? undefined
        : Object.freeze({ ...options.hooks });
    this.#physicalKey = physicalKeyAdapterOf(adapterForFiles);
    const guardedPrefix = normalizeFilesSdkPrefix(options.prefix);
    const plugins = [
      ...(options.plugins ?? []),
      physicalKeyGuardPlugin(
        guardedPrefix,
        this.#physicalKey?.physicalKey.maxBytes,
      ),
    ];
    this.#files = new Files({
      ...options,
      adapter: adapterForFiles,
      ...(hooks !== undefined && { hooks }),
      plugins,
      readonly: readOnly,
    });
    this.#name = adapterForFiles.name;
    this.#conditionalCopy = conditionalCopyAdapterOf(adapterForFiles);
    this.#conditionalDelete = conditionalDeleteAdapterOf(adapterForFiles);
    this.#conditionalRead = conditionalReadAdapterOf(adapterForFiles);
    this.#conditionalUpload = conditionalUploadAdapterOf(adapterForFiles);
    this.#prefix = this.#files.prefix;
    if (guardedPrefix !== this.#prefix) {
      throw new StorageError('Storage prefix normalization was inconsistent.', {
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
      });
    }
    this.#assertPhysicalKeyBudget(this.#prefix);
    this.#readOnly = readOnly;
    this.#retries = storageRetryOptions(options.retries);
    this.#signal = options.signal;
    this.#timeout = options.timeout;
    this.#signedUploadPolicy = signedUploadPolicyAdapterOf(adapterForFiles);
    this.#signedDownloadPolicy = signedDownloadPolicyAdapterOf(adapterForFiles);
  }

  get name(): string {
    return this.#name;
  }

  get capabilities() {
    const capabilities = this.#files.capabilities;
    return {
      cacheControl: capabilities.cacheControl,
      delimiter: capabilities.delimiter,
      metadata: capabilities.metadata,
      rangeRead: capabilities.rangeRead,
      resumableUpload: !this.#readOnly && capabilities.multipart,
      serverSideCopy: !this.#readOnly && capabilities.serverSideCopy,
      ...(!this.#conditionalOperationsBlockedByFilesPolicy &&
        this.#conditionalCopy !== undefined &&
        !this.#readOnly && {
          ...(this.#conditionalCopy.conditionalCopySource !== undefined && {
            conditionalCopySource: {
              ...this.#conditionalCopy.conditionalCopySource,
            },
          }),
          ...(this.#conditionalCopy.conditionalCopyDestination !==
            undefined && {
            conditionalCopyDestination: {
              ...this.#conditionalCopy.conditionalCopyDestination,
            },
          }),
        }),
      ...(!this.#conditionalOperationsBlockedByFilesPolicy &&
        this.#conditionalDelete !== undefined &&
        !this.#readOnly && {
          conditionalDelete: {
            ...this.#conditionalDelete.conditionalDelete,
          },
        }),
      ...(!this.#conditionalOperationsBlockedByFilesPolicy &&
        this.#conditionalRead !== undefined && {
          conditionalRead: { ...this.#conditionalRead.conditionalRead },
        }),
      ...(!this.#conditionalOperationsBlockedByFilesPolicy &&
        this.#conditionalUpload !== undefined &&
        !this.#readOnly && {
          ...(this.#conditionalUpload.conditionalCreate !== undefined && {
            conditionalCreate: {
              ...this.#conditionalUpload.conditionalCreate,
            },
          }),
          ...(this.#conditionalUpload.conditionalReplace !== undefined && {
            conditionalReplace: {
              ...this.#conditionalUpload.conditionalReplace,
            },
          }),
          ...(this.#conditionalUpload.conditionalMultipartCompletion !==
            undefined && {
            conditionalMultipartCompletion: {
              ...this.#conditionalUpload.conditionalMultipartCompletion,
            },
          }),
        }),
      ...(this.#physicalKey !== undefined && {
        physicalKey: { ...this.#physicalKey.physicalKey },
      }),
      signedDownload: { ...capabilities.signedUrl },
      ...(this.#signedDownloadPolicy !== undefined && {
        signedDownloadPolicy: {
          ...this.#signedDownloadPolicy.signedDownloadPolicy,
        },
      }),
      signedUpload: this.#readOnly ? false : ('runtime' as const),
      ...(this.#signedUploadPolicy !== undefined &&
        !this.#readOnly && {
          signedUploadPolicy: {
            ...this.#signedUploadPolicy.signedUploadPolicy,
          },
        }),
      nativeUploadProgress: !this.#readOnly && capabilities.uploadProgress,
    };
  }

  async upload(
    key: string,
    body: StorageBody,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResult> {
    this.#assertLogicalKey(key);
    return this.#call(async () =>
      uploadResultOf(
        await this.#files.upload(key, mapBody(body), uploadOptions(options)),
      ),
    );
  }

  uploadConditional(
    key: string,
    body: StorageBody,
    options: StorageConditionalUploadOptions,
  ): Promise<StorageUploadResult> {
    if (
      options.condition.type === 'replace' &&
      !isCanonicalStorageEtag(options.condition.etag)
    ) {
      return Promise.reject(
        invalidConditionalEtag('condition.etag', key, 'upload'),
      );
    }
    if (this.#conditionalOperationsBlockedByFilesPolicy) {
      return Promise.reject(this.#conditionalFilesPolicyError(key, 'upload'));
    }
    if (this.#readOnly) {
      return Promise.reject(
        new StorageError(
          `Cannot call uploadConditional() on a read-only storage adapter.`,
          {
            code: StorageErrorCode.READ_ONLY,
            key,
            operation: 'upload',
            permanent: true,
          },
        ),
      );
    }
    const adapter = this.#conditionalUpload;
    const capability =
      options.condition.type === 'create'
        ? adapter?.conditionalCreate
        : adapter?.conditionalReplace;
    const multipartRequested =
      options.multipart !== undefined && options.multipart !== false;
    const multipartSupported =
      !multipartRequested ||
      (options.condition.type === 'create'
        ? adapter?.conditionalMultipartCompletion?.create === true
        : adapter?.conditionalMultipartCompletion?.replace === true);
    if (
      adapter === undefined ||
      capability === undefined ||
      !multipartSupported
    ) {
      return Promise.reject(
        new StorageError(
          `Storage adapter "${
            this.#name
          }" does not support conditional upload.`,
          {
            code: StorageErrorCode.NOT_SUPPORTED,
            key,
            operation: 'upload',
            permanent: true,
          },
        ),
      );
    }
    const mergedOptions = this.#conditionalOptions(options);
    return this.#call(async () => {
      const physicalKey = this.#path(key);
      const result = await adapter.uploadConditional(
        physicalKey,
        mapBody(body),
        mergedOptions,
      );
      if (result.key !== physicalKey) {
        throw new StorageError(
          'Storage adapter returned an unexpected conditional upload key.',
          {
            code: StorageErrorCode.PROVIDER,
            key,
            operation: 'upload',
            permanent: true,
          },
        );
      }
      const etag = providerEtag(result.etag, key, 'upload');
      return {
        ...result,
        ...(etag === undefined ? {} : { etag }),
        key,
      };
    });
  }

  async download(
    key: string,
    options?: StorageDownloadOptions,
  ): Promise<StorageObject> {
    this.#assertLogicalKey(key);
    return this.#call(async () => {
      const file = await this.#files.download(key, downloadOptions(options));
      return {
        ...metadataOf(file, 'download'),
        body: normalizeDownloadStream(file.stream()),
      };
    });
  }

  downloadConditional(
    key: string,
    options: StorageConditionalReadOptions,
  ): Promise<StorageObject> {
    if (
      options.condition.etag !== undefined &&
      !isCanonicalStorageEtag(options.condition.etag)
    ) {
      return Promise.reject(
        invalidConditionalEtag('condition.etag', key, 'download'),
      );
    }
    if (this.#conditionalOperationsBlockedByFilesPolicy) {
      return Promise.reject(this.#conditionalFilesPolicyError(key, 'download'));
    }
    const adapter = this.#conditionalRead;
    if (
      adapter === undefined ||
      (options.condition.etag !== undefined && !adapter.conditionalRead.etag) ||
      (options.condition.version !== undefined &&
        !adapter.conditionalRead.version)
    ) {
      return Promise.reject(
        new StorageError(
          `Storage adapter "${this.#name}" does not support conditional read.`,
          {
            code: StorageErrorCode.NOT_SUPPORTED,
            key,
            operation: 'download',
            permanent: true,
          },
        ),
      );
    }
    return this.#call(async () => {
      const physicalKey = this.#path(key);
      const object = await adapter.downloadConditional(
        physicalKey,
        this.#conditionalOptions(options),
      );
      if (object.key !== physicalKey) {
        await object.body.cancel().catch(() => undefined);
        throw new StorageError(
          'Storage adapter returned an unexpected conditional download key.',
          {
            code: StorageErrorCode.PROVIDER,
            key,
            operation: 'download',
            permanent: true,
          },
        );
      }
      let etag: string | undefined;
      try {
        etag = providerEtag(object.etag, key, 'download');
      } catch (error) {
        await object.body.cancel(error).catch(() => undefined);
        throw error;
      }
      return {
        ...object,
        body: normalizeDownloadStream(object.body),
        ...(etag === undefined ? {} : { etag }),
        key,
        name: key.split('/').at(-1) ?? key,
      };
    });
  }

  async head(
    key: string,
    options?: StorageOperationOptions,
  ): Promise<StorageObjectMetadata> {
    this.#assertLogicalKey(key);
    return this.#call(async () =>
      metadataOf(
        await this.#files.head(key, operationOptions(options)),
        'head',
      ),
    );
  }

  exists(key: string, options?: StorageOperationOptions): Promise<boolean> {
    this.#assertLogicalKey(key);
    return this.#call(() => this.#files.exists(key, operationOptions(options)));
  }

  delete(key: string, options?: StorageOperationOptions): Promise<void> {
    this.#assertLogicalKey(key);
    return this.#call(async () => {
      await this.#files.delete(key, operationOptions(options));
    });
  }

  deleteConditional(
    key: string,
    options: StorageConditionalDeleteOptions,
  ): Promise<void> {
    if (!isCanonicalStorageEtag(options.condition.etag)) {
      return Promise.reject(
        invalidConditionalEtag('condition.etag', key, 'delete'),
      );
    }
    if (this.#conditionalOperationsBlockedByFilesPolicy) {
      return Promise.reject(this.#conditionalFilesPolicyError(key, 'delete'));
    }
    if (this.#readOnly) {
      return Promise.reject(
        new StorageError(
          `Cannot call deleteConditional() on a read-only storage adapter.`,
          {
            code: StorageErrorCode.READ_ONLY,
            key,
            operation: 'delete',
            permanent: true,
          },
        ),
      );
    }
    const adapter = this.#conditionalDelete;
    if (adapter === undefined || !adapter.conditionalDelete.etag) {
      return Promise.reject(
        new StorageError(
          `Storage adapter "${
            this.#name
          }" does not support conditional delete.`,
          {
            code: StorageErrorCode.NOT_SUPPORTED,
            key,
            operation: 'delete',
            permanent: true,
          },
        ),
      );
    }
    const mergedOptions = this.#conditionalOptions(options);
    return this.#call(() =>
      adapter.deleteConditional(this.#path(key), mergedOptions),
    );
  }

  copy(
    sourceKey: string,
    destinationKey: string,
    options?: StorageOperationOptions,
  ): Promise<void> {
    this.#assertLogicalKey(sourceKey);
    this.#assertLogicalKey(destinationKey);
    return this.#call(() =>
      this.#files.copy(sourceKey, destinationKey, operationOptions(options)),
    );
  }

  move(
    sourceKey: string,
    destinationKey: string,
    options?: StorageOperationOptions,
  ): Promise<void> {
    this.#assertLogicalKey(sourceKey);
    this.#assertLogicalKey(destinationKey);
    return this.#call(() =>
      this.#files.move(sourceKey, destinationKey, operationOptions(options)),
    );
  }

  promote(
    sourceKey: string,
    destinationKey: string,
    options: StoragePromotionOptions,
  ): Promise<void> {
    const destination = options.destination;
    if (
      destination !== undefined &&
      (typeof destination !== 'object' ||
        destination === null ||
        (destination.type !== 'create' && destination.type !== 'replace'))
    ) {
      return Promise.reject(
        new StorageError('destination.type must be "create" or "replace".', {
          code: StorageErrorCode.INVALID_ARGUMENT,
          key: destinationKey,
          operation: 'promote',
          permanent: true,
        }),
      );
    }
    if (
      options.sourceEtag !== undefined &&
      !isCanonicalStorageEtag(options.sourceEtag)
    ) {
      return Promise.reject(
        invalidConditionalEtag('sourceEtag', sourceKey, 'promote'),
      );
    }
    if (
      destination?.type === 'replace' &&
      !isCanonicalStorageEtag(destination.etag)
    ) {
      return Promise.reject(
        invalidConditionalEtag('destination.etag', destinationKey, 'promote'),
      );
    }
    if (this.#conditionalOperationsBlockedByFilesPolicy) {
      return Promise.reject(
        this.#conditionalFilesPolicyError(sourceKey, 'promote'),
      );
    }
    if (this.#readOnly) {
      return Promise.reject(
        new StorageError(
          `Cannot call promote() on a read-only storage adapter.`,
          {
            code: StorageErrorCode.READ_ONLY,
            key: sourceKey,
            operation: 'promote',
            permanent: true,
          },
        ),
      );
    }
    const adapter = this.#conditionalCopy;
    if (
      adapter === undefined ||
      (options.sourceEtag !== undefined &&
        adapter.conditionalCopySource?.etag !== true) ||
      (options.sourceVersion !== undefined &&
        adapter.conditionalCopySource?.version !== true) ||
      (options.destination?.type === 'create' &&
        adapter.conditionalCopyDestination?.create !== true) ||
      (options.destination?.type === 'replace' &&
        adapter.conditionalCopyDestination?.replace !== true) ||
      (options.destination !== undefined &&
        (options.sourceEtag !== undefined ||
          options.sourceVersion !== undefined) &&
        adapter.conditionalCopyDestination?.atomicWithSource !== true)
    ) {
      return Promise.reject(
        new StorageError(
          `Storage adapter "${
            this.#name
          }" does not support conditional promotion.`,
          {
            code: StorageErrorCode.NOT_SUPPORTED,
            key: sourceKey,
            operation: 'promote',
            permanent: true,
          },
        ),
      );
    }
    return this.#call(() =>
      adapter.promote(
        this.#path(sourceKey),
        this.#path(destinationKey),
        this.#conditionalOptions(options),
      ),
    );
  }

  async list(options?: StorageListOptions): Promise<StorageListResult> {
    this.#assertListPhysicalPrefix(options?.prefix);
    return this.#call(async () => {
      const result = await this.#files.list(listOptions(options));
      return {
        items: result.items.map((file) => metadataOf(file, 'list')),
        ...(result.cursor !== undefined && { cursor: result.cursor }),
        ...(result.prefixes !== undefined && {
          prefixes: [...result.prefixes],
        }),
      };
    });
  }

  search(
    pattern: string | RegExp,
    options?: StorageSearchOptions,
  ): AsyncIterable<StorageObjectMetadata> {
    return this.#search(pattern, options);
  }

  async *#search(
    pattern: string | RegExp,
    options?: StorageSearchOptions,
  ): AsyncGenerator<StorageObjectMetadata, void> {
    try {
      for await (const file of this.#files.search(
        pattern,
        searchOptions(options),
      )) {
        yield metadataOf(file, 'search');
      }
    } catch (error) {
      throw mapFilesSdkError(error);
    }
  }

  signDownload(
    key: string,
    options?: StorageSignedDownloadOptions,
  ): Promise<string> {
    this.#assertLogicalKey(key);
    return this.#call(() =>
      this.#files.url(key, signedDownloadOptions(options)),
    );
  }

  signUpload(
    key: string,
    options: StorageSignedUploadOptions,
  ): Promise<StorageSignedUpload> {
    this.#assertLogicalKey(key);
    return this.#call(() =>
      this.#files.signedUploadUrl(key, signedUploadOptions(options)),
    );
  }

  async #call<Result>(operation: () => Promise<Result>): Promise<Result> {
    try {
      return await operation();
    } catch (error) {
      throw mapFilesSdkError(error);
    }
  }

  #path(key: string): string {
    if (typeof key !== 'string' || key.length === 0) {
      throw new StorageError('key must be a non-empty string.', {
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
      });
    }
    if (key.includes('\0')) {
      throw new StorageError('key must not contain null bytes.', {
        code: StorageErrorCode.INVALID_ARGUMENT,
        key,
        permanent: true,
      });
    }
    const normalized = key.replace(/^\/+/u, '');
    if (
      normalized
        .split('/')
        .some((segment) => segment === '.' || segment === '..')
    ) {
      throw new StorageError('key must not contain . or .. path segments.', {
        code: StorageErrorCode.INVALID_ARGUMENT,
        key,
        permanent: true,
      });
    }
    const physicalKey =
      this.#prefix.length === 0 ? key : `${this.#prefix}/${normalized}`;
    this.#assertPhysicalKeyBudget(physicalKey, key);
    return physicalKey;
  }

  #assertLogicalKey(key: string): void {
    this.#path(key);
  }

  #assertListPhysicalPrefix(prefix: string | undefined): void {
    if (prefix !== undefined && prefix.length > 0) {
      this.#assertLogicalKey(prefix);
      return;
    }
    if (this.#prefix.length > 0) {
      this.#assertPhysicalKeyBudget(`${this.#prefix}/`);
    }
  }

  #physicalKeyExceedsBudget(physicalKey: string): boolean {
    const maxBytes = this.#physicalKey?.physicalKey.maxBytes;
    return (
      maxBytes !== undefined &&
      new TextEncoder().encode(physicalKey).byteLength > maxBytes
    );
  }

  #assertPhysicalKeyBudget(physicalKey: string, logicalKey?: string): void {
    const maxBytes = this.#physicalKey?.physicalKey.maxBytes;
    if (maxBytes === undefined || !this.#physicalKeyExceedsBudget(physicalKey))
      return;
    throw new StorageError(
      `The combined storage prefix and key exceed the provider's ${maxBytes}-byte physical-key limit.`,
      {
        code: StorageErrorCode.LIMIT_EXCEEDED,
        ...(logicalKey !== undefined && { key: logicalKey }),
        permanent: true,
      },
    );
  }

  #conditionalFilesPolicyError(
    key: string,
    operation: 'delete' | 'download' | 'promote' | 'upload',
  ): StorageError {
    return new StorageError(
      'Conditional storage operations are unavailable while Files SDK plugins, hooks, or receipts are configured.',
      {
        code: StorageErrorCode.NOT_SUPPORTED,
        key,
        operation,
        permanent: true,
      },
    );
  }

  #conditionalOptions<
    Options extends
      | StorageConditionalUploadOptions
      | StorageConditionalDeleteOptions
      | StorageConditionalReadOptions
      | StoragePromotionOptions,
  >(options: Options): Options {
    return {
      ...options,
      ...(options.retries === undefined &&
        this.#retries !== undefined && { retries: this.#retries }),
      ...(options.signal === undefined &&
        this.#signal !== undefined && { signal: this.#signal }),
      ...(options.timeout === undefined &&
        this.#timeout !== undefined && { timeout: this.#timeout }),
    };
  }
}

export function createFilesSdkDriver<AdapterType extends Adapter>(
  options: FilesSdkDriverOptions<AdapterType>,
): FilesSdkStorageDriver<AdapterType> {
  return new FilesSdkStorageDriver(options);
}
