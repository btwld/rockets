import {
  MAX_STORAGE_ETAG_BYTES,
  isCanonicalStorageEtag,
  normalizeProviderStorageEtag,
  storageEtagHeader,
} from './storage-etag.js';
import { describe, expect, it } from 'vitest';

describe('storage ETags', () => {
  it('accepts and serializes one canonical bare ETag', () => {
    const etag = '6805f2cfc46c0f04559748bb039d69ae-3';

    expect(isCanonicalStorageEtag(etag)).toBe(true);
    expect(normalizeProviderStorageEtag(etag)).toBe(etag);
    expect(storageEtagHeader(etag)).toBe(`"${etag}"`);
  });

  it('normalizes exactly one provider-owned quote pair', () => {
    expect(normalizeProviderStorageEtag('"provider-etag"')).toBe(
      'provider-etag',
    );
    expect(isCanonicalStorageEtag('"provider-etag"')).toBe(false);
    expect(storageEtagHeader('"provider-etag"')).toBeUndefined();
  });

  it('enforces the canonical ETag byte limit', () => {
    const maximum = 'a'.repeat(MAX_STORAGE_ETAG_BYTES);
    const overMaximum = `${maximum}a`;

    expect(isCanonicalStorageEtag(maximum)).toBe(true);
    expect(normalizeProviderStorageEtag(`"${maximum}"`)).toBe(maximum);
    expect(storageEtagHeader(maximum)).toBe(`"${maximum}"`);

    expect(isCanonicalStorageEtag(overMaximum)).toBe(false);
    expect(normalizeProviderStorageEtag(`"${overMaximum}"`)).toBeUndefined();
    expect(storageEtagHeader(overMaximum)).toBeUndefined();
  });

  it.each([
    ['', 'empty'],
    ['*', 'wildcard'],
    ['W/etag', 'uppercase weak prefix'],
    ['w/etag', 'lowercase weak prefix'],
    ['"etag', 'leading quote'],
    ['etag"', 'trailing quote'],
    ['""etag""', 'multiple quote pairs'],
    ['"first", "second"', 'entity-tag list'],
    ['first,second', 'comma'],
    ['first\\second', 'backslash'],
    ['etag value', 'space'],
    ['\tetag', 'tab'],
    ['etag\n', 'line feed'],
    ['etag\r', 'carriage return'],
    ['etag\0', 'NUL'],
    [`etag${String.fromCharCode(0x1f)}`, 'control character'],
    [`etag${String.fromCharCode(0x7f)}`, 'DEL'],
    ['étag', 'non-ASCII character'],
  ])('rejects %s (%s)', (value) => {
    expect(isCanonicalStorageEtag(value)).toBe(false);
    expect(normalizeProviderStorageEtag(value)).toBeUndefined();
    expect(storageEtagHeader(value)).toBeUndefined();
  });

  it('rejects quoted provider values whose opaque token is unsafe', () => {
    for (const value of [
      '"*"',
      '"W/etag"',
      '"w/etag"',
      '"first,second"',
      '"first\\second"',
      '"etag value"',
      '"étag"',
    ]) {
      expect(normalizeProviderStorageEtag(value)).toBeUndefined();
    }
  });
});
