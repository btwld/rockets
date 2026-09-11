/** Maximum UTF-8 byte length of a normalized storage ETag. */
export const MAX_STORAGE_ETAG_BYTES = 1024;

// Deliberately narrower than RFC 9110's etagc grammar. Commas and backslashes
// are excluded so a normalized value cannot be confused with an entity-tag
// list or be interpreted differently by legacy HTTP implementations.
const canonicalStorageEtag =
  /^(?!\*$)(?![Ww]\/)[\x21\x23-\x2B\x2D-\x5B\x5D-\x7E]+$/u;

/** Returns whether a value is the package's canonical bare ETag form. */
export function isCanonicalStorageEtag(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_STORAGE_ETAG_BYTES &&
    canonicalStorageEtag.test(value)
  );
}

/**
 * Normalizes one provider-returned strong entity tag to the canonical bare
 * form. Providers may return either the HTTP-quoted representation or an
 * already-normalized value; lists, weak tags, and malformed values fail.
 */
export function normalizeProviderStorageEtag(
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const opaque =
    value.startsWith('"') && value.endsWith('"') && value.length >= 3
      ? value.slice(1, -1)
      : value;
  return isCanonicalStorageEtag(opaque) ? opaque : undefined;
}

/** Serializes one canonical bare ETag as exactly one HTTP entity tag. */
export function storageEtagHeader(value: unknown): string | undefined {
  return isCanonicalStorageEtag(value) ? `"${value}"` : undefined;
}
