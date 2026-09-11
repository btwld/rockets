import {
  StorageError,
  StorageErrorCode,
  isStorageError,
  normalizeStorageError,
} from './storage.error.js';
import { describe, expect, it } from 'vitest';

describe('StorageError', () => {
  it('is recognized across duplicated package copies', () => {
    const brand = Symbol.for('@concepta/rockets-storage/StorageError');
    class ForeignStorageError extends Error {
      override readonly name = 'StorageError';
      readonly [brand] = true;
      readonly code = StorageErrorCode.NOT_FOUND;
      readonly store = 'foreign';
      readonly operation = 'head';
      readonly key = 'missing.bin';
      readonly aborted = false;
      readonly timedOut = false;
      readonly permanent = true;
    }

    const error = new ForeignStorageError('missing');
    expect(isStorageError(error)).toBe(true);
    expect(normalizeStorageError(error)).toBe(error);
  });

  it('recognizes the exact legacy structural shape without a brand', () => {
    const error = Object.assign(new Error('legacy'), {
      aborted: false,
      code: StorageErrorCode.PROVIDER,
      key: undefined,
      name: 'StorageError',
      operation: undefined,
      permanent: false,
      store: undefined,
      timedOut: false,
    });

    expect(isStorageError(error)).toBe(true);
  });

  it('does not classify unrelated errors from a coincidental code or name', () => {
    expect(
      isStorageError(
        Object.assign(new Error('provider'), {
          code: StorageErrorCode.NOT_FOUND,
        }),
      ),
    ).toBe(false);
    expect(
      isStorageError(
        Object.assign(new Error('incomplete'), {
          code: StorageErrorCode.NOT_FOUND,
          name: 'StorageError',
        }),
      ),
    ).toBe(false);
    expect(isStorageError({ code: StorageErrorCode.NOT_FOUND })).toBe(false);
  });

  it('brands owned errors without exposing the marker during enumeration', () => {
    const error = new StorageError('missing', {
      code: StorageErrorCode.NOT_FOUND,
    });

    expect(isStorageError(error)).toBe(true);
    expect(
      Object.getOwnPropertyDescriptor(
        error,
        Symbol.for('@concepta/rockets-storage/StorageError'),
      ),
    ).toMatchObject({ enumerable: false, value: true, writable: false });
  });
});
