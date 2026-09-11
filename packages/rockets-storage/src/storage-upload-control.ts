import { UploadControl, type ResumableUploadSession } from 'files-sdk';

import { StorageError, StorageErrorCode } from './storage.error.js';

export type StorageUploadStatus =
  | 'idle'
  | 'uploading'
  | 'paused'
  | 'completed'
  | 'aborted'
  | 'error';

/**
 * Opaque, JSON-serializable resume token. Its payload is deliberately unknown:
 * provider session fields are an implementation detail of the pinned engine.
 */
export interface StorageResumableToken {
  readonly version: 1;
  readonly format: '@concepta/rockets-storage/resumable';
  readonly session: unknown;
}

const controls = new WeakMap<StorageUploadControl, UploadControl>();

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function validParts(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((part) => {
      const record = recordOf(part);
      return (
        record !== undefined &&
        positiveNumber(record.partNumber) &&
        nonNegativeNumber(record.size) &&
        (record.etag === undefined || nonEmptyString(record.etag))
      );
    })
  );
}

function validResumableSession(
  value: unknown,
): value is ResumableUploadSession {
  const session = recordOf(value);
  if (session === undefined || !nonEmptyString(session.provider)) {
    return false;
  }

  const strings = (...fields: string[]): boolean =>
    fields.every((field) => nonEmptyString(session[field]));

  switch (session.provider) {
    case 's3':
      return (
        strings('bucket', 'key', 'uploadId') && positiveNumber(session.partSize)
      );
    case 'gcs':
      return strings('bucket', 'key', 'uri');
    case 'google-drive':
      return strings('key', 'uri');
    case 'azure':
      return (
        strings('container', 'blob', 'contentType') &&
        positiveNumber(session.blockSize)
      );
    case 'onedrive':
      return strings('itemPath', 'uploadUrl');
    case 'dropbox':
      return (
        strings('path', 'sessionId', 'contentType') &&
        nonNegativeNumber(session.offset)
      );
    case 'vercel-blob':
      return (
        strings('key', 'storageKey', 'uploadId', 'contentType') &&
        positiveNumber(session.partSize) &&
        validParts(session.parts)
      );
    case 'fs':
      return strings('key', 'tempPath', 'contentType');
    case 'memory':
      return strings('key', 'uploadId', 'contentType');
    case 'ftp':
    case 'sftp':
      return strings('key');
    case 'bun-s3':
      return strings('key', 'uploadId', 'contentType');
    case 'supabase':
      return strings('key', 'uri', 'contentType');
    case 'appwrite':
      return (
        strings('key', 'fileId', 'contentType') &&
        nonNegativeNumber(session.offset)
      );
    case 'cloudinary':
      return (
        strings('key', 'uploadId', 'contentType') &&
        nonNegativeNumber(session.offset)
      );
    case 'box':
      return strings('key', 'uploadId', 'contentType');
    default:
      return false;
  }
}

function controlOf(control: StorageUploadControl): UploadControl {
  const delegate = controls.get(control);
  if (delegate === undefined) {
    throw new StorageError('Invalid storage upload control.', {
      code: StorageErrorCode.INVALID_ARGUMENT,
      permanent: true,
    });
  }
  return delegate;
}

export class StorageUploadControl {
  constructor() {
    controls.set(this, new UploadControl());
  }

  static from(token: unknown): StorageUploadControl {
    const value = recordOf(token);
    if (
      value === undefined ||
      value.version !== 1 ||
      value.format !== '@concepta/rockets-storage/resumable' ||
      !validResumableSession(value.session)
    ) {
      throw new StorageError('Invalid storage resumable-upload token.', {
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
      });
    }

    const wrapper = new StorageUploadControl();
    controls.set(wrapper, UploadControl.from(value.session));
    return wrapper;
  }

  get status(): StorageUploadStatus {
    return controlOf(this).status;
  }

  get loaded(): number {
    return controlOf(this).loaded;
  }

  get total(): number | undefined {
    return controlOf(this).total;
  }

  pause(): void {
    controlOf(this).pause();
  }

  resume(): void {
    controlOf(this).resume();
  }

  abort(reason?: unknown): Promise<void> {
    return controlOf(this).abort(reason);
  }

  toJSON(): StorageResumableToken | undefined {
    const session = controlOf(this).toJSON();
    if (session === undefined) {
      return undefined;
    }

    return {
      format: '@concepta/rockets-storage/resumable',
      session,
      version: 1,
    };
  }
}

/** @internal */
export function getFilesSdkUploadControl(
  control: StorageUploadControl,
): UploadControl {
  return controlOf(control);
}
