const collectionsByKey = new Map<string, string>();

/** Map a dynamic-repository key to a Firestore collection id. */
export function registerFirestoreCollection(
  key: string,
  collection: string,
): void {
  collectionsByKey.set(key, collection);
}

export function resolveFirestoreCollection(key: string): string | undefined {
  return collectionsByKey.get(key);
}
