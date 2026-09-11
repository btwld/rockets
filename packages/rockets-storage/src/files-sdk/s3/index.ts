import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import {
  createPresignedPost,
  type PresignedPostOptions,
} from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import {
  mapS3Error,
  s3 as createFilesSdkS3Adapter,
  type S3Adapter,
  type S3AdapterOptions,
} from 'files-sdk/s3';

import type {
  StorageBody,
  StorageConditionalDeleteOptions,
  StorageConditionalReadOptions,
  StorageConditionalUploadOptions,
  StorageObject,
  StorageOperationOptions,
  StoragePromotionOptions,
  StorageUploadResult,
} from '../../storage.types.js';
import {
  StorageError,
  StorageErrorCode,
  isStorageError,
} from '../../storage.error.js';
import {
  normalizeProviderStorageEtag,
  storageEtagHeader,
} from '../../storage-etag.js';
import {
  assertFilesSdkS3AdapterHasNoReservedExtensions,
  createFilesSdkDriver,
  markFilesSdkS3AdapterUndecorated,
  markFilesSdkS3RawClientProvenance,
  type FilesSdkConditionalCopyAdapter,
  type FilesSdkConditionalDeleteAdapter,
  type FilesSdkConditionalReadAdapter,
  type FilesSdkConditionalUploadAdapter,
  type FilesSdkDriverOptions,
  type FilesSdkPhysicalKeyAdapter,
  type FilesSdkSignedUploadPolicyAdapter,
  type FilesSdkSignedDownloadPolicyAdapter,
  type FilesSdkStorageDriver,
  mapFilesSdkError,
} from '../files-sdk.driver.js';
import {
  getS3ConstructionMetadata,
  recordS3ConstructionMetadata,
} from './construction-metadata.js';
import {
  assertS3ProviderProfileContainedBy,
  assertVerifiedS3ProviderProfile,
  defineS3ProviderProfile,
  type S3ProviderProfile,
} from './provider-profile.js';

export {
  defineS3ProviderProfile,
  type S3ProviderProfile,
  type S3ProviderProfileInput,
} from './provider-profile.js';

export interface S3StorageDriverOptions
  extends Omit<FilesSdkDriverOptions<S3Adapter>, 'adapter'> {
  adapter: S3AdapterOptions;
  /**
   * Exact, conformance-verified provider behavior. Native AWS S3 uses the
   * built-in AWS profile when no endpoint override is present; an explicit
   * native profile may only narrow that immutable ceiling. Endpoint overrides
   * without an explicit profile force the whole driver read-only.
   */
  providerProfile?: S3ProviderProfile;
}

export const AWS_S3_PROVIDER_PROFILE = defineS3ProviderProfile({
  name: 'aws-s3-general-purpose',
  physicalKey: { maxBytes: 1024 },
  signedUploadPolicy: { contentType: true, sizeRange: true },
  conditionalCreate: { resultEtag: true },
  conditionalReplace: { resultEtag: true },
  conditionalDelete: { etag: true },
  conditionalRead: { etag: true, version: true },
  conditionalCopySource: { etag: true, version: true },
  conditionalCopyDestination: {
    atomicWithSource: true,
    create: true,
    replace: true,
  },
  conditionalMultipartCompletion: { create: true, replace: true },
});

export const CLOUDFLARE_R2_PROVIDER_PROFILE = defineS3ProviderProfile({
  name: 'cloudflare-r2-stable',
  physicalKey: { maxBytes: 1024 },
  signedUploadPolicy: { contentType: true, sizeRange: false },
  conditionalCreate: { resultEtag: true },
  conditionalReplace: { resultEtag: true },
  conditionalRead: { etag: true, version: false },
  conditionalCopySource: { etag: true, version: false },
});

const UNVERIFIED_S3_PROVIDER_PROFILE = defineS3ProviderProfile({
  name: 'unverified-s3-compatible',
  physicalKey: { maxBytes: 1024 },
  signedUploadPolicy: { contentType: false, sizeRange: false },
});

type S3StorageAdapterBase = S3Adapter &
  FilesSdkPhysicalKeyAdapter &
  FilesSdkSignedDownloadPolicyAdapter &
  FilesSdkSignedUploadPolicyAdapter;

export type S3StorageAdapter = S3StorageAdapterBase &
  Partial<
    FilesSdkConditionalCopyAdapter &
      FilesSdkConditionalDeleteAdapter &
      FilesSdkConditionalReadAdapter &
      FilesSdkConditionalUploadAdapter
  >;

function copySource(
  bucket: string,
  key: string,
  version: string | undefined,
): string {
  const source = `${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`;
  return version === undefined
    ? source
    : `${source}?versionId=${encodeURIComponent(version)}`;
}

function operationSignal(
  options: StorageOperationOptions,
): AbortSignal | undefined {
  const timeoutSignal =
    options.timeout === undefined || options.timeout <= 0
      ? undefined
      : AbortSignal.timeout(options.timeout);
  if (options.signal === undefined) {
    return timeoutSignal;
  }
  return timeoutSignal === undefined
    ? options.signal
    : AbortSignal.any([options.signal, timeoutSignal]);
}

function maxRetries(options: StorageOperationOptions): number {
  const configured =
    typeof options.retries === 'number'
      ? options.retries
      : options.retries?.max;
  return Math.max(0, Math.floor(configured ?? 0));
}

function etagHeader(
  etag: string,
  key: string,
  operation: 'copy' | 'delete' | 'download' | 'upload',
  label: string,
): string {
  const header = storageEtagHeader(etag);
  if (header === undefined) {
    throw new StorageError(`${label} must be a canonical storage ETag.`, {
      code: StorageErrorCode.INVALID_ARGUMENT,
      key,
      operation,
      permanent: true,
    });
  }
  return header;
}

function providerEtag(
  etag: unknown,
  key: string,
  operation: 'download' | 'upload',
): string | undefined {
  if (etag === undefined) {
    return undefined;
  }
  const normalized = normalizeProviderStorageEtag(etag);
  if (normalized === undefined) {
    throw new StorageError('S3 returned an invalid ETag.', {
      code: StorageErrorCode.PROVIDER,
      key,
      operation,
      permanent: true,
    });
  }
  return normalized;
}

function contentTypeOf(
  body: StorageBody,
  override: string | undefined,
): string {
  if (override !== undefined) {
    return override;
  }
  if (typeof body === 'string') {
    return 'text/plain; charset=utf-8';
  }
  if (body instanceof Blob && body.type.length > 0) {
    return body.type;
  }
  return 'application/octet-stream';
}

async function normalizeConditionalBody(
  body: StorageBody,
  onProgress: StorageConditionalUploadOptions['onProgress'],
): Promise<{
  body: Uint8Array | ReadableStream<Uint8Array>;
  size: () => number;
  contentLength?: number;
}> {
  let bytes: Uint8Array | undefined;
  if (typeof body === 'string') {
    bytes = new TextEncoder().encode(body);
  } else if (body instanceof Uint8Array) {
    bytes = body;
  } else if (body instanceof ArrayBuffer) {
    bytes = new Uint8Array(body);
  } else if (ArrayBuffer.isView(body)) {
    bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  } else if (body instanceof Blob) {
    bytes = new Uint8Array(await body.arrayBuffer());
  }

  if (bytes !== undefined) {
    const total = bytes.byteLength;
    onProgress?.({ loaded: 0, total });
    return { body: bytes, contentLength: total, size: () => total };
  }

  const stream =
    body instanceof Readable
      ? (Readable.toWeb(body) as ReadableStream<Uint8Array>)
      : body;
  if (!(stream instanceof ReadableStream)) {
    throw new StorageError('Unsupported conditional upload body.', {
      code: StorageErrorCode.INVALID_ARGUMENT,
      operation: 'upload',
      permanent: true,
    });
  }
  const reader = stream.getReader();
  let loaded = 0;
  return {
    body: new ReadableStream<Uint8Array>({
      cancel(reason) {
        return reader.cancel(reason);
      },
      async pull(controller) {
        const result = await reader.read();
        if (result.done) {
          controller.close();
          return;
        }
        loaded += result.value.byteLength;
        controller.enqueue(result.value);
        onProgress?.({ loaded });
      },
    }),
    size: () => loaded,
  };
}

function s3ErrorIdentity(error: unknown): {
  code: string | undefined;
  status: number | undefined;
} {
  if (typeof error !== 'object' || error === null) {
    return { code: undefined, status: undefined };
  }
  const candidate = error as {
    readonly name?: unknown;
    readonly Code?: unknown;
    readonly code?: unknown;
    readonly $metadata?: { readonly httpStatusCode?: unknown };
  };
  const serviceCode = candidate.name ?? candidate.Code ?? candidate.code;
  const status = candidate.$metadata?.httpStatusCode;
  return {
    code: typeof serviceCode === 'string' ? serviceCode : undefined,
    status: typeof status === 'number' ? status : undefined,
  };
}

function mapS3ConditionalError(
  error: unknown,
  operation: 'copy' | 'delete' | 'download' | 'upload',
): StorageError {
  if (isStorageError(error)) {
    return error;
  }
  const identity = s3ErrorIdentity(error);
  const provider = mapFilesSdkError(mapS3Error(error));
  const precondition =
    identity.status === 412 || identity.code === 'PreconditionFailed';
  const conditionalConflict =
    identity.status === 409 || identity.code === 'ConditionalRequestConflict';
  const notFound =
    identity.status === 404 ||
    identity.code === 'NoSuchKey' ||
    identity.code === 'NoSuchUpload' ||
    provider.code === StorageErrorCode.NOT_FOUND;
  const code =
    precondition || conditionalConflict
      ? StorageErrorCode.CONFLICT
      : notFound
      ? StorageErrorCode.NOT_FOUND
      : provider.code;
  return new StorageError(`Conditional S3 ${operation} failed.`, {
    aborted: provider.aborted,
    code,
    operation,
    permanent:
      precondition || notFound
        ? true
        : conditionalConflict
        ? false
        : provider.permanent,
    timedOut: provider.timedOut,
  });
}

async function withS3Retry<Result>(
  options: StorageOperationOptions,
  operationName: 'copy' | 'delete' | 'download' | 'upload',
  operation: (signal: AbortSignal | undefined) => Promise<Result>,
): Promise<Result> {
  const retries = maxRetries(options);
  for (let attempt = 0; ; attempt += 1) {
    const signal = operationSignal(options);
    try {
      return await operation(signal);
    } catch (error) {
      const mapped = mapS3ConditionalError(error, operationName);
      if (
        attempt >= retries ||
        mapped.code !== StorageErrorCode.PROVIDER ||
        mapped.aborted ||
        mapped.permanent ||
        signal?.aborted === true
      ) {
        throw mapped;
      }
      const delay =
        typeof options.retries === 'object' &&
        options.retries.backoff !== undefined
          ? options.retries.backoff({
              attempt: attempt + 1,
              error: mapped,
            })
          : Math.min(1000, 100 * 2 ** attempt);
      await waitForRetry(delay, options.signal);
    }
  }
}

async function waitForRetry(
  milliseconds: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (signal?.aborted === true) {
    throw signal.reason;
  }
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => signal?.removeEventListener('abort', abort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, Math.max(0, milliseconds));
    const abort = (): void => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

/** AWS SigV4 refuses to sign a presigned URL living longer than 7 days. */
const SIGV4_MAX_EXPIRES_IN_SECONDS = 604_800;

const S3_MIN_MULTIPART_PART_BYTES = 5 * 1024 * 1024;
const S3_MAX_MULTIPART_PARTS = 10_000;

function conditionalHeaders(
  condition: StorageConditionalUploadOptions['condition'],
  key: string,
): { IfMatch?: string; IfNoneMatch?: string } {
  return condition.type === 'create'
    ? { IfNoneMatch: '*' }
    : {
        IfMatch: etagHeader(condition.etag, key, 'upload', 'condition.etag'),
      };
}

function rangeHeader(
  range: StorageConditionalReadOptions['range'],
): string | undefined {
  if (range === undefined) return undefined;
  return `bytes=${range.start}-${range.end ?? ''}`;
}

function s3ResponseStream(body: unknown): ReadableStream<Uint8Array> {
  let stream: ReadableStream<Uint8Array>;
  if (body instanceof ReadableStream) {
    stream = body;
  } else if (body instanceof Readable) {
    stream = Readable.toWeb(body) as ReadableStream<Uint8Array>;
  } else if (
    typeof body === 'object' &&
    body !== null &&
    'transformToWebStream' in body &&
    typeof body.transformToWebStream === 'function'
  ) {
    stream = body.transformToWebStream() as ReadableStream<Uint8Array>;
  } else {
    throw new StorageError('Conditional S3 download returned no body stream.', {
      code: StorageErrorCode.PROVIDER,
      operation: 'download',
      permanent: true,
    });
  }

  const reader = stream.getReader();
  return new ReadableStream<Uint8Array>({
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch (error) {
        throw mapS3ConditionalError(error, 'download');
      } finally {
        reader.releaseLock();
      }
    },
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          reader.releaseLock();
          controller.close();
          return;
        }
        controller.enqueue(result.value);
      } catch (error) {
        reader.releaseLock();
        controller.error(mapS3ConditionalError(error, 'download'));
      }
    },
  });
}

async function* multipartParts(
  source: Uint8Array | ReadableStream<Uint8Array>,
  partSize: number,
): AsyncGenerator<Uint8Array> {
  if (source instanceof Uint8Array) {
    for (let offset = 0; offset < source.byteLength; offset += partSize) {
      yield source.subarray(
        offset,
        Math.min(offset + partSize, source.byteLength),
      );
    }
    return;
  }

  const reader = source.getReader();
  let buffered = new Uint8Array(0);
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      const combined = new Uint8Array(
        buffered.byteLength + result.value.byteLength,
      );
      combined.set(buffered);
      combined.set(result.value, buffered.byteLength);
      buffered = combined;
      while (buffered.byteLength >= partSize) {
        yield buffered.slice(0, partSize);
        buffered = buffered.slice(partSize);
      }
    }
    if (buffered.byteLength > 0) yield buffered;
  } finally {
    reader.releaseLock();
  }
}

function missingResultEtag(key: string): StorageError {
  return new StorageError(
    'S3 committed a conditional upload without returning the ETag required to identify its result; reconcile the destination before retrying.',
    {
      code: StorageErrorCode.PROVIDER,
      key,
      operation: 'upload',
      permanent: true,
    },
  );
}

type S3RequestAdapter = Pick<S3Adapter, 'bucket' | 'raw'>;

async function uploadConditionalSingle(
  base: S3RequestAdapter,
  key: string,
  body: StorageBody,
  conditional: StorageConditionalUploadOptions,
): Promise<StorageUploadResult> {
  const normalized = await normalizeConditionalBody(
    body,
    conditional.onProgress,
  );
  const contentType = contentTypeOf(body, conditional.contentType);
  const retryOptions: StorageOperationOptions =
    normalized.contentLength === undefined
      ? { ...conditional, retries: 0 }
      : conditional;
  const result = await withS3Retry(retryOptions, 'upload', (signal) =>
    base.raw.send(
      new PutObjectCommand({
        Body: normalized.body,
        Bucket: base.bucket,
        ...(conditional.cacheControl !== undefined && {
          CacheControl: conditional.cacheControl,
        }),
        ...(normalized.contentLength !== undefined && {
          ContentLength: normalized.contentLength,
        }),
        ContentType: contentType,
        ...conditionalHeaders(conditional.condition, key),
        Key: key,
        ...(conditional.metadata !== undefined && {
          Metadata: conditional.metadata,
        }),
      }),
      signal === undefined ? undefined : { abortSignal: signal },
    ),
  );
  const size = normalized.size();
  conditional.onProgress?.({
    loaded: size,
    ...(normalized.contentLength !== undefined && {
      total: normalized.contentLength,
    }),
  });
  const etag = providerEtag(result.ETag, key, 'upload');
  if (etag === undefined) throw missingResultEtag(key);
  return { contentType, etag, key, size };
}

async function uploadConditionalMultipart(
  base: S3RequestAdapter,
  key: string,
  body: StorageBody,
  conditional: StorageConditionalUploadOptions,
): Promise<StorageUploadResult> {
  const configuredPartSize =
    typeof conditional.multipart === 'object'
      ? conditional.multipart.partSize
      : undefined;
  if (
    configuredPartSize !== undefined &&
    (!Number.isSafeInteger(configuredPartSize) || configuredPartSize <= 0)
  ) {
    throw new StorageError(
      'multipart.partSize must be a positive safe integer.',
      {
        code: StorageErrorCode.INVALID_ARGUMENT,
        key,
        operation: 'upload',
        permanent: true,
      },
    );
  }
  const partSize = Math.max(
    S3_MIN_MULTIPART_PART_BYTES,
    configuredPartSize ?? S3_MIN_MULTIPART_PART_BYTES,
  );
  const normalized = await normalizeConditionalBody(body, undefined);
  if (normalized.contentLength === 0) {
    return uploadConditionalSingle(base, key, new Uint8Array(), {
      ...conditional,
      multipart: false,
    });
  }
  const contentType = contentTypeOf(body, conditional.contentType);
  let uploadId: string | undefined;
  let size = 0;
  try {
    const created = await withS3Retry(conditional, 'upload', (signal) =>
      base.raw.send(
        new CreateMultipartUploadCommand({
          Bucket: base.bucket,
          ...(conditional.cacheControl !== undefined && {
            CacheControl: conditional.cacheControl,
          }),
          ContentType: contentType,
          Key: key,
          ...(conditional.metadata !== undefined && {
            Metadata: conditional.metadata,
          }),
        }),
        signal === undefined ? undefined : { abortSignal: signal },
      ),
    );
    uploadId = created.UploadId;
    if (uploadId === undefined || uploadId.length === 0) {
      throw new StorageError('S3 did not return a multipart upload ID.', {
        code: StorageErrorCode.PROVIDER,
        key,
        operation: 'upload',
        permanent: true,
      });
    }

    const completedParts: Array<{ ETag: string; PartNumber: number }> = [];
    let partNumber = 0;
    for await (const part of multipartParts(normalized.body, partSize)) {
      partNumber += 1;
      if (partNumber > S3_MAX_MULTIPART_PARTS) {
        throw new StorageError(
          `Conditional multipart upload exceeds the ${S3_MAX_MULTIPART_PARTS}-part S3 limit.`,
          {
            code: StorageErrorCode.LIMIT_EXCEEDED,
            key,
            operation: 'upload',
            permanent: true,
          },
        );
      }
      const uploaded = await withS3Retry(conditional, 'upload', (signal) =>
        base.raw.send(
          new UploadPartCommand({
            Body: part,
            Bucket: base.bucket,
            ContentLength: part.byteLength,
            Key: key,
            PartNumber: partNumber,
            UploadId: uploadId,
          }),
          signal === undefined ? undefined : { abortSignal: signal },
        ),
      );
      const partEtag = providerEtag(uploaded.ETag, key, 'upload');
      if (partEtag === undefined) {
        throw new StorageError('S3 upload part returned no ETag.', {
          code: StorageErrorCode.PROVIDER,
          key,
          operation: 'upload',
          permanent: true,
        });
      }
      completedParts.push({
        ETag: storageEtagHeader(partEtag)!,
        PartNumber: partNumber,
      });
      size += part.byteLength;
      conditional.onProgress?.({
        loaded: size,
        ...(normalized.contentLength !== undefined && {
          total: normalized.contentLength,
        }),
      });
    }
    if (completedParts.length === 0) {
      await base.raw.send(
        new AbortMultipartUploadCommand({
          Bucket: base.bucket,
          Key: key,
          UploadId: uploadId,
        }),
      );
      uploadId = undefined;
      return uploadConditionalSingle(base, key, new Uint8Array(), {
        ...conditional,
        multipart: false,
      });
    }

    const completed = await withS3Retry(conditional, 'upload', (signal) =>
      base.raw.send(
        new CompleteMultipartUploadCommand({
          Bucket: base.bucket,
          ...conditionalHeaders(conditional.condition, key),
          Key: key,
          MultipartUpload: { Parts: completedParts },
          UploadId: uploadId,
        }),
        signal === undefined ? undefined : { abortSignal: signal },
      ),
    );
    const etag = providerEtag(completed.ETag, key, 'upload');
    if (etag === undefined) throw missingResultEtag(key);
    uploadId = undefined;
    return { contentType, etag, key, size };
  } catch (error) {
    if (uploadId !== undefined) {
      await base.raw
        .send(
          new AbortMultipartUploadCommand({
            Bucket: base.bucket,
            Key: key,
            UploadId: uploadId,
          }),
        )
        .catch(() => undefined);
    }
    throw error;
  }
}

const configuredS3Clients = new WeakSet<S3Adapter['raw']>();

/** Constructs the upstream S3 adapter while retaining security-relevant metadata. */
export function s3(options: S3AdapterOptions): S3Adapter {
  const adapter = createFilesSdkS3Adapter(options);
  markFilesSdkS3AdapterUndecorated(adapter);
  recordS3ConstructionMetadata(adapter.raw, {
    publicBaseUrlConfigured: options.publicBaseUrl !== undefined,
  });
  return adapter;
}

/**
 * Adds only the exact operations declared by one verified provider profile.
 * Each raw adapter may be decorated once so capability state cannot depend on
 * profile application order. A native AWS SDK endpoint also bounds every
 * explicit profile by the built-in AWS capability ceiling.
 */
export function withS3Capabilities(
  base: S3Adapter,
  options: Pick<S3AdapterOptions, 'endpoint' | 'publicBaseUrl'> & {
    providerProfile?: S3ProviderProfile;
  } = {},
): S3StorageAdapter {
  const raw = base.raw;
  if (configuredS3Clients.has(raw)) {
    throw new TypeError(
      'withS3Capabilities may only be applied once to an S3 adapter.',
    );
  }
  assertFilesSdkS3AdapterHasNoReservedExtensions(base);
  const sdkHasCustomEndpoint = raw.config.isCustomEndpoint === true;
  if (options.endpoint !== undefined && !sdkHasCustomEndpoint) {
    throw new TypeError(
      'The declared S3 endpoint does not match the SDK client endpoint provenance.',
    );
  }
  if (!sdkHasCustomEndpoint) {
    // files-sdk does not expose this S3Client constructor option. Endpoint
    // resolution is lazy, so fixing the resolved SDK config before the adapter
    // is exposed prevents environment and shared-config endpoint redirection.
    raw.config.ignoreConfiguredEndpointUrls = true;
  }
  const inferredNativeAws = base.name === 's3' && !sdkHasCustomEndpoint;
  const profile =
    options.providerProfile ??
    (inferredNativeAws
      ? AWS_S3_PROVIDER_PROFILE
      : UNVERIFIED_S3_PROVIDER_PROFILE);
  assertVerifiedS3ProviderProfile(profile);
  if (!sdkHasCustomEndpoint) {
    assertS3ProviderProfileContainedBy(profile, AWS_S3_PROVIDER_PROFILE);
  }
  const provenance =
    options.providerProfile === undefined
      ? inferredNativeAws
        ? 'native'
        : 'unverified'
      : inferredNativeAws
      ? 'native'
      : 'verified';
  const constructionMetadata = getS3ConstructionMetadata(raw);
  const publicBaseUrlConfigured =
    options.publicBaseUrl !== undefined ||
    constructionMetadata?.publicBaseUrlConfigured === true;
  const bucket = base.bucket;
  const requestAdapter: S3RequestAdapter = { bucket, raw };
  const signedUploadUrl: S3Adapter['signedUploadUrl'] = async (
    key,
    signOptions,
  ) => {
    if (
      signOptions.minSize !== undefined &&
      signOptions.maxSize === undefined
    ) {
      throw new StorageError(
        'S3 signed uploads cannot enforce minSize without maxSize.',
        {
          code: StorageErrorCode.NOT_SUPPORTED,
          key,
          operation: 'signUpload',
          permanent: true,
        },
      );
    }
    if (signOptions.maxSize !== undefined && key.endsWith('${filename}')) {
      throw new StorageError(
        'Signed POST keys must not end with the AWS ${filename} template.',
        {
          code: StorageErrorCode.INVALID_ARGUMENT,
          key,
          operation: 'signUpload',
          permanent: true,
        },
      );
    }
    if (
      signOptions.contentType !== undefined &&
      profile.signedUploadPolicy.contentType !== true
    ) {
      throw new StorageError(
        `S3 provider profile "${profile.name}" cannot enforce signed-upload contentType.`,
        {
          code: StorageErrorCode.NOT_SUPPORTED,
          key,
          operation: 'signUpload',
          permanent: true,
        },
      );
    }
    if (
      signOptions.maxSize !== undefined &&
      profile.signedUploadPolicy.sizeRange !== true
    ) {
      throw new StorageError(
        `S3 provider profile "${profile.name}" cannot enforce signed-upload sizeRange.`,
        {
          code: StorageErrorCode.NOT_SUPPORTED,
          key,
          operation: 'signUpload',
          permanent: true,
        },
      );
    }

    try {
      if (signOptions.maxSize !== undefined) {
        const conditions: NonNullable<PresignedPostOptions['Conditions']> = [
          [
            'content-length-range',
            signOptions.minSize ?? 1,
            signOptions.maxSize,
          ],
        ];
        if (signOptions.contentType !== undefined) {
          conditions.push(['eq', '$Content-Type', signOptions.contentType]);
        }
        const post = await createPresignedPost(raw, {
          Bucket: bucket,
          Conditions: conditions,
          Expires: signOptions.expiresIn,
          Key: key,
          ...(signOptions.contentType !== undefined && {
            Fields: { 'Content-Type': signOptions.contentType },
          }),
        });
        return { fields: post.fields, method: 'POST', url: post.url };
      }

      const url = await getSignedUrl(
        raw,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ...(signOptions.contentType !== undefined && {
            ContentType: signOptions.contentType,
          }),
        }),
        {
          expiresIn: signOptions.expiresIn,
          ...(signOptions.contentType !== undefined && {
            signableHeaders: new Set(['content-type']),
          }),
        },
      );
      return {
        ...(signOptions.contentType !== undefined && {
          headers: { 'Content-Type': signOptions.contentType },
        }),
        method: 'PUT',
        url,
      };
    } catch (error: unknown) {
      throw mapS3Error(error);
    }
  };
  const adapter = Object.assign(base, {
    physicalKey: profile.physicalKey,
    signedUploadPolicy: profile.signedUploadPolicy,
    signedUploadUrl,
    signedDownloadPolicy: Object.freeze({
      expiresIn: constructionMetadata !== undefined && !publicBaseUrlConfigured,
      maxExpiresIn: SIGV4_MAX_EXPIRES_IN_SECONDS,
    }),
  } satisfies FilesSdkPhysicalKeyAdapter & FilesSdkSignedDownloadPolicyAdapter & FilesSdkSignedUploadPolicyAdapter & Pick<S3Adapter, 'signedUploadUrl'>) as S3StorageAdapter;

  if (
    profile.conditionalCopySource !== undefined ||
    profile.conditionalCopyDestination !== undefined
  ) {
    Object.assign(adapter, {
      ...(profile.conditionalCopySource !== undefined && {
        conditionalCopySource: profile.conditionalCopySource,
      }),
      ...(profile.conditionalCopyDestination !== undefined && {
        conditionalCopyDestination: profile.conditionalCopyDestination,
      }),
      async promote(
        sourceKey: string,
        destinationKey: string,
        promotion: StoragePromotionOptions,
      ): Promise<void> {
        const destination = promotion.destination;
        if (
          destination !== undefined &&
          (typeof destination !== 'object' ||
            destination === null ||
            (destination.type !== 'create' && destination.type !== 'replace'))
        ) {
          throw new StorageError(
            'destination.type must be "create" or "replace".',
            {
              code: StorageErrorCode.INVALID_ARGUMENT,
              key: destinationKey,
              operation: 'promote',
              permanent: true,
            },
          );
        }
        if (
          (promotion.sourceEtag !== undefined &&
            profile.conditionalCopySource?.etag !== true) ||
          (promotion.sourceVersion !== undefined &&
            profile.conditionalCopySource?.version !== true) ||
          (promotion.destination?.type === 'create' &&
            profile.conditionalCopyDestination?.create !== true) ||
          (promotion.destination?.type === 'replace' &&
            profile.conditionalCopyDestination?.replace !== true) ||
          (promotion.destination !== undefined &&
            (promotion.sourceEtag !== undefined ||
              promotion.sourceVersion !== undefined) &&
            profile.conditionalCopyDestination?.atomicWithSource !== true)
        ) {
          throw new StorageError(
            `S3 provider profile "${profile.name}" does not support the requested conditional promotion.`,
            {
              code: StorageErrorCode.NOT_SUPPORTED,
              key: sourceKey,
              operation: 'promote',
              permanent: true,
            },
          );
        }
        await withS3Retry(promotion, 'copy', async (signal) => {
          await raw.send(
            new CopyObjectCommand({
              Bucket: bucket,
              CopySource: copySource(
                bucket,
                sourceKey,
                promotion.sourceVersion,
              ),
              ...(promotion.sourceEtag !== undefined && {
                CopySourceIfMatch: etagHeader(
                  promotion.sourceEtag,
                  sourceKey,
                  'copy',
                  'sourceEtag',
                ),
              }),
              ...(promotion.destination?.type === 'create'
                ? { IfNoneMatch: '*' }
                : promotion.destination?.type === 'replace'
                ? {
                    IfMatch: etagHeader(
                      promotion.destination.etag,
                      destinationKey,
                      'copy',
                      'destination.etag',
                    ),
                  }
                : {}),
              Key: destinationKey,
            }),
            signal === undefined ? undefined : { abortSignal: signal },
          );
        });
      },
    } satisfies FilesSdkConditionalCopyAdapter);
  }

  if (profile.conditionalRead !== undefined) {
    Object.assign(adapter, {
      conditionalRead: profile.conditionalRead,
      async downloadConditional(
        key: string,
        options: StorageConditionalReadOptions,
      ): Promise<StorageObject> {
        if (
          (options.condition.etag !== undefined &&
            profile.conditionalRead?.etag !== true) ||
          (options.condition.version !== undefined &&
            profile.conditionalRead?.version !== true)
        ) {
          throw new StorageError(
            `S3 provider profile "${profile.name}" does not support the requested conditional read.`,
            {
              code: StorageErrorCode.NOT_SUPPORTED,
              key,
              operation: 'download',
              permanent: true,
            },
          );
        }
        const result = await withS3Retry(options, 'download', (signal) =>
          raw.send(
            new GetObjectCommand({
              Bucket: bucket,
              ...(options.condition.etag !== undefined && {
                IfMatch: etagHeader(
                  options.condition.etag,
                  key,
                  'download',
                  'condition.etag',
                ),
              }),
              Key: key,
              ...(rangeHeader(options.range) !== undefined && {
                Range: rangeHeader(options.range),
              }),
              ...(options.condition.version !== undefined && {
                VersionId: options.condition.version,
              }),
            }),
            signal === undefined ? undefined : { abortSignal: signal },
          ),
        );
        const etag = providerEtag(result.ETag, key, 'download');
        return {
          body: s3ResponseStream(result.Body),
          contentType: result.ContentType ?? 'application/octet-stream',
          ...(etag !== undefined && { etag }),
          key,
          ...(result.LastModified !== undefined && {
            lastModified: result.LastModified,
          }),
          ...(result.Metadata !== undefined && { metadata: result.Metadata }),
          name: key.split('/').at(-1) ?? key,
          size: Number(result.ContentLength ?? 0),
        };
      },
    } satisfies FilesSdkConditionalReadAdapter);
  }

  if (profile.conditionalDelete !== undefined) {
    Object.assign(adapter, {
      conditionalDelete: profile.conditionalDelete,
      async deleteConditional(
        key: string,
        options: StorageConditionalDeleteOptions,
      ): Promise<void> {
        await withS3Retry(options, 'delete', async (signal) => {
          await raw.send(
            new DeleteObjectCommand({
              Bucket: bucket,
              IfMatch: etagHeader(
                options.condition.etag,
                key,
                'delete',
                'condition.etag',
              ),
              Key: key,
            }),
            signal === undefined ? undefined : { abortSignal: signal },
          );
        });
      },
    } satisfies FilesSdkConditionalDeleteAdapter);
  }

  if (
    profile.conditionalCreate !== undefined ||
    profile.conditionalReplace !== undefined
  ) {
    Object.assign(adapter, {
      ...(profile.conditionalCreate !== undefined && {
        conditionalCreate: profile.conditionalCreate,
      }),
      ...(profile.conditionalReplace !== undefined && {
        conditionalReplace: profile.conditionalReplace,
      }),
      ...(profile.conditionalMultipartCompletion !== undefined && {
        conditionalMultipartCompletion: profile.conditionalMultipartCompletion,
      }),
      async uploadConditional(
        key: string,
        body: StorageBody,
        conditional: StorageConditionalUploadOptions,
      ): Promise<StorageUploadResult> {
        if (conditional.condition.type === 'replace') {
          etagHeader(
            conditional.condition.etag,
            key,
            'upload',
            'condition.etag',
          );
        }
        const supported =
          conditional.condition.type === 'create'
            ? profile.conditionalCreate !== undefined
            : profile.conditionalReplace !== undefined;
        const multipartRequested =
          conditional.multipart !== undefined &&
          conditional.multipart !== false;
        const multipartSupported =
          !multipartRequested ||
          (conditional.condition.type === 'create'
            ? profile.conditionalMultipartCompletion?.create === true
            : profile.conditionalMultipartCompletion?.replace === true);
        if (!supported || !multipartSupported) {
          throw new StorageError(
            `S3 provider profile "${profile.name}" does not support the requested conditional upload.`,
            {
              code: StorageErrorCode.NOT_SUPPORTED,
              key,
              operation: 'upload',
              permanent: true,
            },
          );
        }
        if (conditional.control !== undefined) {
          throw new StorageError(
            'Conditional S3 uploads do not support resumable control.',
            {
              code: StorageErrorCode.NOT_SUPPORTED,
              key,
              operation: 'upload',
              permanent: true,
            },
          );
        }
        return multipartRequested
          ? uploadConditionalMultipart(requestAdapter, key, body, conditional)
          : uploadConditionalSingle(requestAdapter, key, body, conditional);
      },
    } satisfies FilesSdkConditionalUploadAdapter);
  }

  Object.freeze(adapter);
  markFilesSdkS3RawClientProvenance(raw, adapter, provenance);
  configuredS3Clients.add(raw);
  return adapter;
}

/**
 * Creates the files-sdk S3 driver from the storage package's own dependency
 * context and exposes only the operations in its verified provider profile.
 */
export function createS3StorageDriver(
  options: S3StorageDriverOptions,
): FilesSdkStorageDriver<S3StorageAdapter> {
  const { adapter: adapterOptions, ...filesOptions } = options;
  const { providerProfile, ...plainFilesOptions } = filesOptions;
  const unverifiedCustomEndpoint =
    adapterOptions.endpoint !== undefined && providerProfile === undefined;
  return createFilesSdkDriver({
    ...plainFilesOptions,
    ...(unverifiedCustomEndpoint && { readonly: true }),
    adapter: withS3Capabilities(s3(adapterOptions), {
      ...adapterOptions,
      ...(providerProfile !== undefined && { providerProfile }),
    }),
  });
}

export { mapS3Error };
export type { S3Adapter, S3AdapterOptions, S3Sdk } from 'files-sdk/s3';
