export const DEFAULT_STORAGE_NAME = 'default';

export const STORAGE_DEFAULT_NAME = Symbol.for(
  '@concepta/rockets-storage/default-name',
);

export function normalizeStorageName(
  name: string = DEFAULT_STORAGE_NAME,
): string {
  if (typeof name !== 'string' || name.length === 0 || name.trim() !== name) {
    throw new TypeError(
      'Storage store names must be non-empty strings without leading or trailing whitespace.',
    );
  }
  return name;
}

export function getStorageToken(name: string = DEFAULT_STORAGE_NAME): symbol {
  return Symbol.for(
    `@concepta/rockets-storage/store/${normalizeStorageName(name)}`,
  );
}

export const STORAGE = getStorageToken();
