import type { StorageCapabilities } from '../../storage.types.js';

type S3ProfileCapabilities = Pick<
  StorageCapabilities,
  | 'conditionalCreate'
  | 'conditionalReplace'
  | 'conditionalDelete'
  | 'conditionalRead'
  | 'conditionalCopySource'
  | 'conditionalCopyDestination'
  | 'conditionalMultipartCompletion'
  | 'physicalKey'
  | 'signedUploadPolicy'
>;

const verifiedS3ProviderProfile = Symbol('verifiedS3ProviderProfile');
const verifiedS3ProviderProfiles = new WeakSet<object>();

export interface S3ProviderProfileInput extends S3ProfileCapabilities {
  /** Stable profile identity for configuration, diagnostics, and audit. */
  readonly name: string;
  /** Every S3-compatible profile must declare its complete-key byte budget. */
  readonly physicalKey: NonNullable<S3ProfileCapabilities['physicalKey']>;
  /** Constraints the provider proves; omission defaults both claims to false. */
  readonly signedUploadPolicy?: NonNullable<
    S3ProfileCapabilities['signedUploadPolicy']
  >;
}

/** A validated profile created by {@link defineS3ProviderProfile}. */
export type S3ProviderProfile = Readonly<
  Omit<S3ProviderProfileInput, 'signedUploadPolicy'> & {
    readonly signedUploadPolicy: NonNullable<
      S3ProfileCapabilities['signedUploadPolicy']
    >;
  }
> & {
  readonly [verifiedS3ProviderProfile]: true;
};

function assertCapabilityBoolean(
  value: unknown,
  label: string,
): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${label} must be a boolean.`);
  }
}

/** Validates and deeply freezes an explicitly verified S3-compatible profile. */
export function defineS3ProviderProfile(
  profile: S3ProviderProfileInput,
): S3ProviderProfile {
  if (typeof profile.name !== 'string' || profile.name.trim().length === 0) {
    throw new TypeError('S3 provider profile name must be a non-empty string.');
  }
  if (
    !Number.isSafeInteger(profile.physicalKey.maxBytes) ||
    profile.physicalKey.maxBytes <= 0
  ) {
    throw new TypeError(
      'S3 provider profile physicalKey.maxBytes must be a positive safe integer.',
    );
  }

  const booleanFields = [
    [
      profile.signedUploadPolicy !== undefined,
      'signedUploadPolicy.contentType',
      profile.signedUploadPolicy?.contentType,
    ],
    [
      profile.signedUploadPolicy !== undefined,
      'signedUploadPolicy.sizeRange',
      profile.signedUploadPolicy?.sizeRange,
    ],
    [
      profile.conditionalCreate !== undefined,
      'conditionalCreate.resultEtag',
      profile.conditionalCreate?.resultEtag,
    ],
    [
      profile.conditionalReplace !== undefined,
      'conditionalReplace.resultEtag',
      profile.conditionalReplace?.resultEtag,
    ],
    [
      profile.conditionalDelete !== undefined,
      'conditionalDelete.etag',
      profile.conditionalDelete?.etag,
    ],
    [
      profile.conditionalRead !== undefined,
      'conditionalRead.etag',
      profile.conditionalRead?.etag,
    ],
    [
      profile.conditionalRead !== undefined,
      'conditionalRead.version',
      profile.conditionalRead?.version,
    ],
    [
      profile.conditionalCopySource !== undefined,
      'conditionalCopySource.etag',
      profile.conditionalCopySource?.etag,
    ],
    [
      profile.conditionalCopySource !== undefined,
      'conditionalCopySource.version',
      profile.conditionalCopySource?.version,
    ],
    [
      profile.conditionalCopyDestination !== undefined,
      'conditionalCopyDestination.create',
      profile.conditionalCopyDestination?.create,
    ],
    [
      profile.conditionalCopyDestination !== undefined,
      'conditionalCopyDestination.replace',
      profile.conditionalCopyDestination?.replace,
    ],
    [
      profile.conditionalCopyDestination !== undefined,
      'conditionalCopyDestination.atomicWithSource',
      profile.conditionalCopyDestination?.atomicWithSource,
    ],
    [
      profile.conditionalMultipartCompletion !== undefined,
      'conditionalMultipartCompletion.create',
      profile.conditionalMultipartCompletion?.create,
    ],
    [
      profile.conditionalMultipartCompletion !== undefined,
      'conditionalMultipartCompletion.replace',
      profile.conditionalMultipartCompletion?.replace,
    ],
  ] as const;
  for (const [declared, label, value] of booleanFields) {
    if (declared) assertCapabilityBoolean(value, label);
  }
  if (
    profile.conditionalCopyDestination?.atomicWithSource === true &&
    profile.conditionalCopySource?.etag !== true &&
    profile.conditionalCopySource?.version !== true
  ) {
    throw new TypeError(
      'An atomic destination-copy profile must enable at least one source-copy condition.',
    );
  }
  if (
    profile.conditionalCopyDestination?.atomicWithSource === true &&
    profile.conditionalCopyDestination.create !== true &&
    profile.conditionalCopyDestination.replace !== true
  ) {
    throw new TypeError(
      'An atomic destination-copy profile must declare create or replace support.',
    );
  }
  if (
    profile.conditionalMultipartCompletion?.create === true &&
    profile.conditionalCreate === undefined
  ) {
    throw new TypeError(
      'Conditional multipart create requires conditional create support.',
    );
  }
  if (
    profile.conditionalMultipartCompletion?.replace === true &&
    profile.conditionalReplace === undefined
  ) {
    throw new TypeError(
      'Conditional multipart replace requires conditional replace support.',
    );
  }

  const clone: Omit<S3ProviderProfileInput, 'signedUploadPolicy'> & {
    readonly signedUploadPolicy: NonNullable<
      S3ProfileCapabilities['signedUploadPolicy']
    >;
  } = {
    name: profile.name.trim(),
    physicalKey: Object.freeze({ ...profile.physicalKey }),
    signedUploadPolicy: Object.freeze(
      profile.signedUploadPolicy === undefined
        ? { contentType: false, sizeRange: false }
        : { ...profile.signedUploadPolicy },
    ),
    ...(profile.conditionalCreate !== undefined && {
      conditionalCreate: Object.freeze({ ...profile.conditionalCreate }),
    }),
    ...(profile.conditionalReplace !== undefined && {
      conditionalReplace: Object.freeze({ ...profile.conditionalReplace }),
    }),
    ...(profile.conditionalDelete !== undefined && {
      conditionalDelete: Object.freeze({ ...profile.conditionalDelete }),
    }),
    ...(profile.conditionalRead !== undefined && {
      conditionalRead: Object.freeze({ ...profile.conditionalRead }),
    }),
    ...(profile.conditionalCopySource !== undefined && {
      conditionalCopySource: Object.freeze({
        ...profile.conditionalCopySource,
      }),
    }),
    ...(profile.conditionalCopyDestination !== undefined && {
      conditionalCopyDestination: Object.freeze({
        ...profile.conditionalCopyDestination,
      }),
    }),
    ...(profile.conditionalMultipartCompletion !== undefined && {
      conditionalMultipartCompletion: Object.freeze({
        ...profile.conditionalMultipartCompletion,
      }),
    }),
  };
  Object.defineProperty(clone, verifiedS3ProviderProfile, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
  const verified = Object.freeze(clone) as S3ProviderProfile;
  verifiedS3ProviderProfiles.add(verified);
  return verified;
}

export function assertVerifiedS3ProviderProfile(
  profile: S3ProviderProfile,
): void {
  if (
    typeof profile !== 'object' ||
    profile === null ||
    !verifiedS3ProviderProfiles.has(profile)
  ) {
    throw new TypeError(
      'providerProfile must be created with defineS3ProviderProfile().',
    );
  }
}

export function assertS3ProviderProfileContainedBy(
  profile: S3ProviderProfile,
  ceiling: S3ProviderProfile,
): void {
  if (profile.physicalKey.maxBytes > ceiling.physicalKey.maxBytes) {
    throw new TypeError(
      `S3 provider profile "${profile.name}" cannot widen ${ceiling.name} physicalKey.maxBytes beyond ${ceiling.physicalKey.maxBytes}.`,
    );
  }

  const operationCapabilities = [
    ['conditionalCreate', profile.conditionalCreate, ceiling.conditionalCreate],
    [
      'conditionalReplace',
      profile.conditionalReplace,
      ceiling.conditionalReplace,
    ],
    ['conditionalDelete', profile.conditionalDelete, ceiling.conditionalDelete],
    ['conditionalRead', profile.conditionalRead, ceiling.conditionalRead],
    [
      'conditionalCopySource',
      profile.conditionalCopySource,
      ceiling.conditionalCopySource,
    ],
    [
      'conditionalCopyDestination',
      profile.conditionalCopyDestination,
      ceiling.conditionalCopyDestination,
    ],
    [
      'conditionalMultipartCompletion',
      profile.conditionalMultipartCompletion,
      ceiling.conditionalMultipartCompletion,
    ],
  ] as const;
  for (const [name, declared, supported] of operationCapabilities) {
    if (declared !== undefined && supported === undefined) {
      throw new TypeError(
        `S3 provider profile "${profile.name}" cannot widen ${ceiling.name} with ${name}.`,
      );
    }
  }

  const booleanClaims = [
    [
      'signedUploadPolicy.contentType',
      profile.signedUploadPolicy.contentType,
      ceiling.signedUploadPolicy.contentType,
    ],
    [
      'signedUploadPolicy.sizeRange',
      profile.signedUploadPolicy.sizeRange,
      ceiling.signedUploadPolicy.sizeRange,
    ],
    [
      'conditionalCreate.resultEtag',
      profile.conditionalCreate?.resultEtag,
      ceiling.conditionalCreate?.resultEtag,
    ],
    [
      'conditionalReplace.resultEtag',
      profile.conditionalReplace?.resultEtag,
      ceiling.conditionalReplace?.resultEtag,
    ],
    [
      'conditionalDelete.etag',
      profile.conditionalDelete?.etag,
      ceiling.conditionalDelete?.etag,
    ],
    [
      'conditionalRead.etag',
      profile.conditionalRead?.etag,
      ceiling.conditionalRead?.etag,
    ],
    [
      'conditionalRead.version',
      profile.conditionalRead?.version,
      ceiling.conditionalRead?.version,
    ],
    [
      'conditionalCopySource.etag',
      profile.conditionalCopySource?.etag,
      ceiling.conditionalCopySource?.etag,
    ],
    [
      'conditionalCopySource.version',
      profile.conditionalCopySource?.version,
      ceiling.conditionalCopySource?.version,
    ],
    [
      'conditionalCopyDestination.create',
      profile.conditionalCopyDestination?.create,
      ceiling.conditionalCopyDestination?.create,
    ],
    [
      'conditionalCopyDestination.replace',
      profile.conditionalCopyDestination?.replace,
      ceiling.conditionalCopyDestination?.replace,
    ],
    [
      'conditionalCopyDestination.atomicWithSource',
      profile.conditionalCopyDestination?.atomicWithSource,
      ceiling.conditionalCopyDestination?.atomicWithSource,
    ],
    [
      'conditionalMultipartCompletion.create',
      profile.conditionalMultipartCompletion?.create,
      ceiling.conditionalMultipartCompletion?.create,
    ],
    [
      'conditionalMultipartCompletion.replace',
      profile.conditionalMultipartCompletion?.replace,
      ceiling.conditionalMultipartCompletion?.replace,
    ],
  ] as const;
  for (const [name, declared, supported] of booleanClaims) {
    if (declared === true && supported !== true) {
      throw new TypeError(
        `S3 provider profile "${profile.name}" cannot widen ${ceiling.name} with ${name}.`,
      );
    }
  }
}
