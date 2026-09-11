import type { Readable } from 'node:stream';

import type { StorageError } from './storage.error.js';
import type { StorageUploadControl } from './storage-upload-control.js';

export type StorageBody =
  | Blob
  | File
  | ReadableStream<Uint8Array>
  | Readable
  | ArrayBuffer
  | ArrayBufferView
  | Uint8Array
  | string;

export interface StorageRetryContext {
  attempt: number;
  error: StorageError;
}

export type StorageRetryOptions =
  | number
  | {
      max: number;
      backoff?: (context: StorageRetryContext) => number;
    };

export interface StorageOperationOptions {
  signal?: AbortSignal;
  timeout?: number;
  retries?: StorageRetryOptions;
}

/**
 * Preconditions for promoting a staged object to its final key. At least one
 * source identity must be supplied; unsupported identities fail closed.
 */
export interface StoragePromotionOptions extends StorageOperationOptions {
  /** Copy only the source object whose provider ETag exactly matches. */
  sourceEtag?: string;
  /** Copy this immutable provider version of the source object. */
  sourceVersion?: string;
  /**
   * Protect the destination in the same provider copy request. When a source
   * condition is also present, the provider profile must explicitly declare
   * that both predicates are evaluated atomically.
   */
  destination?: { type: 'create' } | { type: 'replace'; etag: string };
}

export interface StorageMultipartOptions {
  partSize?: number;
  concurrency?: number;
}

export interface StorageUploadProgress {
  loaded: number;
  total?: number;
}

export interface StorageUploadOptions extends StorageOperationOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  onProgress?: (progress: StorageUploadProgress) => void;
  multipart?: boolean | StorageMultipartOptions;
  control?: StorageUploadControl;
}

export type StorageConditionalUploadOptions = StorageUploadOptions &
  (
    | {
        /** Atomically create the object only when its key does not exist. */
        condition: { type: 'create' };
      }
    | {
        /** Atomically replace the object only when its current ETag matches. */
        condition: { type: 'replace'; etag: string };
      }
  );

export interface StorageConditionalDeleteOptions
  extends StorageOperationOptions {
  /** Atomically delete the object only when its current ETag matches. */
  condition: { etag: string };
}

export interface StorageUploadResult {
  key: string;
  size: number;
  contentType: string;
  /** Canonical bare provider ETag; pass it back unchanged as a condition. */
  etag?: string;
  lastModified?: Date;
}

export interface StorageObjectMetadata {
  key: string;
  name: string;
  size: number;
  contentType: string;
  /** Canonical bare provider ETag; pass it back unchanged as a condition. */
  etag?: string;
  lastModified?: Date;
  metadata?: Record<string, string>;
}

export interface StorageObject extends StorageObjectMetadata {
  body: ReadableStream<Uint8Array>;
}

export interface StorageByteRange {
  start: number;
  end?: number;
}

export interface StorageDownloadOptions extends StorageOperationOptions {
  range?: StorageByteRange;
}

/**
 * Reads one exact observed object identity. At least one provider identity is
 * required; a driver must never emulate this with a separate head request.
 */
export type StorageConditionalReadOptions = StorageDownloadOptions &
  (
    | {
        condition: { etag: string; version?: string };
      }
    | {
        condition: { etag?: string; version: string };
      }
  );

export interface StorageBufferedDownloadOptions extends StorageDownloadOptions {
  /**
   * Maximum number of bytes buffered in memory. Defaults to 10 MiB.
   * Pass `Infinity` only when the caller has independently bounded the object.
   */
  maxBytes?: number;
}

export interface StorageListOptions extends StorageOperationOptions {
  prefix?: string;
  /**
   * Opaque, non-consuming continuation token returned by `list`.
   *
   * The token is bound to the original `prefix` and `delimiter`, but callers
   * may change `limit` when resuming. While the provider token remains valid
   * and available, replaying it against unchanged provider state must return
   * the same logical position; token bytes returned for the following position
   * need not be stable.
   */
  cursor?: string;
  limit?: number;
  delimiter?: string;
}

export interface StorageListResult {
  items: StorageObjectMetadata[];
  prefixes?: string[];
  /**
   * Opaque, replayable continuation token for the next logical position.
   * See `StorageDriver.list` for the complete portability contract.
   */
  cursor?: string;
}

export type StorageSearchMatch = 'glob' | 'regex' | 'substring' | 'exact';

export interface StorageSearchOptions extends StorageOperationOptions {
  prefix?: string;
  limit?: number;
  maxResults?: number;
  match?: StorageSearchMatch;
  caseInsensitive?: boolean;
}

export interface StorageSignedDownloadOptions extends StorageOperationOptions {
  /**
   * Expiry in seconds. Omitting it does NOT mean "never expires": the
   * provider's own default applies, and this package neither sets nor
   * verifies it. Pass an explicit value whenever the expiry matters.
   * Requesting one on a store whose `signedDownloadPolicy.expiresIn` is not
   * `true` fails with `NOT_SUPPORTED` instead of minting a URL that ignores
   * it.
   */
  expiresIn?: number;
  responseContentDisposition?: string;
}

export interface StorageSignedUploadOptions extends StorageOperationOptions {
  expiresIn: number;
  contentType?: string;
  maxSize?: number;
  minSize?: number;
}

export type StorageSignedUpload =
  | {
      method: 'PUT';
      url: string;
      headers?: Record<string, string>;
    }
  | {
      method: 'POST';
      url: string;
      fields: Record<string, string>;
    };

export interface StorageSignedUrlCapability {
  supported: boolean;
  /**
   * Hard ceiling on `expiresIn`, in seconds, that the provider enforces in
   * code (Azure clamps user-delegation SAS to 7 days, Dropbox links are a
   * fixed 4 hours). Absent when the provider enforces none.
   */
  maxExpiresIn?: number;
}

export interface StorageConditionalWriteCapability {
  /** A successful write returns the provider ETag identifying its result. */
  resultEtag: boolean;
}

export interface StorageConditionalDeleteCapability {
  /** Delete can compare the current object against an opaque provider ETag. */
  etag: boolean;
}

export interface StorageConditionalReadCapability {
  /** Read can require the current object to match an opaque provider ETag. */
  etag: boolean;
  /** Read can select an immutable provider version. */
  version: boolean;
}

export interface StorageConditionalCopySourceCapability {
  /** Copy can require the source to match an opaque provider ETag. */
  etag: boolean;
  /** Copy can select an immutable source version. */
  version: boolean;
}

export interface StorageConditionalCopyDestinationCapability {
  /** Copy can require that the destination does not exist. */
  create: boolean;
  /** Copy can require that the destination matches an opaque provider ETag. */
  replace: boolean;
  /** Source and destination predicates share one provider linearization point. */
  atomicWithSource: boolean;
}

export interface StorageConditionalMultipartCompletionCapability {
  /** Multipart completion can require that the destination does not exist. */
  create: boolean;
  /** Multipart completion can require that the destination ETag matches. */
  replace: boolean;
}

export interface StoragePhysicalKeyCapability {
  /** Maximum UTF-8 bytes in the complete provider key, including prefixes. */
  maxBytes: number;
}

export interface StorageSignedUploadPolicyCapability {
  /** The signed request fixes the exact declared content type. */
  contentType: boolean;
  /** The signed request enforces the requested min/max byte range. */
  sizeRange: boolean;
}

export interface StorageSignedDownloadPolicyCapability {
  /** Every generated URL honors the requested expiry. */
  expiresIn: boolean;
  /**
   * Largest expiry, in seconds, the adapter's signature format accepts, for
   * ceilings the provider documents but does not enforce in code (AWS SigV4
   * stops at 7 days). Complements
   * {@link StorageSignedUrlCapability.maxExpiresIn}; the lower of the two
   * applies.
   */
  maxExpiresIn?: number;
}

export interface StorageCapabilities {
  rangeRead: boolean;
  /** True when the provider reports native byte-level upload progress. */
  nativeUploadProgress: boolean;
  delimiter: boolean;
  metadata: boolean;
  cacheControl: boolean;
  resumableUpload: boolean;
  serverSideCopy: boolean;
  /**
   * Native create-if-absent support. Absent means unsupported; callers must
   * not emulate it with an exists request followed by an unconditional write.
   */
  conditionalCreate?: StorageConditionalWriteCapability;
  /**
   * Native replace-if-current-ETag-matches support. Absent means unsupported.
   */
  conditionalReplace?: StorageConditionalWriteCapability;
  /** Native delete-if-current-ETag-matches support. */
  conditionalDelete?: StorageConditionalDeleteCapability;
  /** Native conditional read of an exact observed identity. */
  conditionalRead?: StorageConditionalReadCapability;
  /** Source predicates supported by conditional server-side copy. */
  conditionalCopySource?: StorageConditionalCopySourceCapability;
  /** Destination predicates supported by conditional server-side copy. */
  conditionalCopyDestination?: StorageConditionalCopyDestinationCapability;
  /** Conditions enforced by multipart completion rather than part upload. */
  conditionalMultipartCompletion?: StorageConditionalMultipartCompletionCapability;
  /** Provider budget for the complete physical key. */
  physicalKey?: StoragePhysicalKeyCapability;
  signedDownload: StorageSignedUrlCapability;
  /** Expiry guarantees enforced by the provider adapter. */
  signedDownloadPolicy?: StorageSignedDownloadPolicyCapability;
  /**
   * Some providers decide support from credentials or requested constraints,
   * so direct-upload support can only be known when the call is attempted.
   */
  signedUpload: boolean | 'runtime';
  /**
   * Constraints cryptographically/provider-policy enforced by direct upload.
   * Absent means callers must not assume request options are enforced.
   */
  signedUploadPolicy?: StorageSignedUploadPolicyCapability;
}

export interface StorageBulkOptions {
  concurrency?: number;
  stopOnError?: boolean;
}

export interface StorageBulkError {
  key: string;
  error: StorageError;
}

export interface StorageUploadManyItem {
  key: string;
  body: StorageBody;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  multipart?: boolean | StorageMultipartOptions;
}

export interface StorageUploadManyOptions
  extends StorageBulkOptions,
    StorageOperationOptions {
  onProgress?: (progress: StorageUploadProgress & { key: string }) => void;
}

export interface StorageUploadManyResult {
  uploaded: StorageUploadResult[];
  errors?: StorageBulkError[];
}

export interface StorageDownloadManyResult {
  downloaded: StorageObject[];
  errors?: StorageBulkError[];
}

export interface StorageHeadManyResult {
  objects: StorageObjectMetadata[];
  errors?: StorageBulkError[];
}

export interface StorageExistsManyResult {
  existing: string[];
  missing: string[];
  errors?: StorageBulkError[];
}

export interface StorageDeleteManyResult {
  deleted: string[];
  errors?: StorageBulkError[];
}

export type StorageOperationName =
  | 'upload'
  | 'download'
  | 'head'
  | 'exists'
  | 'delete'
  | 'copy'
  | 'move'
  | 'promote'
  | 'list'
  | 'search'
  | 'signDownload'
  | 'signUpload';

export interface StorageOperationContext {
  store: string;
  operation: StorageOperationName;
  key?: string;
  from?: string;
  to?: string;
}

export interface StoragePlugin {
  name?: string;
  /**
   * Runs before the driver and may reject an operation, for example to enforce
   * policy. Hooks run in registration order.
   */
  beforeOperation?: (context: StorageOperationContext) => void | Promise<void>;
  /**
   * Observes a successful operation. Throwing turns the call into a failure,
   * which is useful for mandatory audit sinks.
   *
   * For streaming downloads, success means the provider returned a stream.
   * Later consumption failures are normalized for the stream consumer but do
   * not re-enter plugin hooks.
   */
  afterOperation?: (
    context: StorageOperationContext,
    result: unknown,
  ) => void | Promise<void>;
  /**
   * Best-effort error observation. Hook failures never replace the original
   * storage error.
   */
  onError?: (
    context: StorageOperationContext,
    error: StorageError,
  ) => void | Promise<void>;
}

export interface StorageTransferProgress {
  done: number;
  total: number;
  key: string;
  status: 'transferred' | 'skipped';
}

export interface StorageTransferOptions extends StorageBulkOptions {
  from: string;
  to: string;
  prefix?: string;
  transformKey?: (key: string) => string;
  overwrite?: boolean;
  limit?: number;
  signal?: AbortSignal;
  onProgress?: (progress: StorageTransferProgress) => void;
}

export interface StorageTransferResult {
  transferred: string[];
  skipped?: string[];
  errors?: StorageBulkError[];
}

export type StorageSyncCompare =
  | 'etag'
  | 'size'
  | ((
      source: StorageObjectMetadata,
      destination: StorageObjectMetadata,
    ) => boolean);

export interface StorageSyncProgress {
  done: number;
  total: number;
  key: string;
  status: 'uploaded' | 'skipped' | 'deleted';
}

export interface StorageSyncOptions extends StorageBulkOptions {
  from: string;
  to: string;
  prefix?: string;
  destinationPrefix?: string;
  transformKey?: (key: string) => string;
  prune?: boolean;
  compare?: StorageSyncCompare;
  dryRun?: boolean;
  limit?: number;
  signal?: AbortSignal;
  onProgress?: (progress: StorageSyncProgress) => void;
}

export interface StorageSyncResult {
  uploaded: string[];
  skipped: string[];
  deleted?: string[];
  errors?: StorageBulkError[];
}
