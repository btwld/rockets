export interface S3ConstructionMetadata {
  /** Whether URL generation bypasses signing through a configured public origin. */
  readonly publicBaseUrlConfigured: boolean;
}

const constructionMetadata = new WeakMap<
  object,
  Readonly<S3ConstructionMetadata>
>();

export function recordS3ConstructionMetadata(
  raw: object,
  metadata: S3ConstructionMetadata,
): void {
  const existing = constructionMetadata.get(raw);
  if (
    existing !== undefined &&
    existing.publicBaseUrlConfigured !== metadata.publicBaseUrlConfigured
  ) {
    throw new TypeError('S3 adapter construction metadata cannot be changed.');
  }
  constructionMetadata.set(raw, Object.freeze({ ...metadata }));
}

export function getS3ConstructionMetadata(
  raw: object,
): Readonly<S3ConstructionMetadata> | undefined {
  return constructionMetadata.get(raw);
}
