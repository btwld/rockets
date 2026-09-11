import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { StorageClient } from '../storage.client.js';
import type { StorageDriver } from '../storage.driver.js';
import { createFsStorageDriver } from '../files-sdk/fs/index.js';
import {
  AWS_S3_PROVIDER_PROFILE,
  CLOUDFLARE_R2_PROVIDER_PROFILE,
  createS3StorageDriver,
  defineS3ProviderProfile,
  type S3ProviderProfile,
} from '../files-sdk/s3/index.js';
import {
  createStorageProviderConformanceCases,
  type StorageProviderConformanceCapabilities,
  type StorageProviderConformanceFixture,
  type StorageProviderConformanceOptions,
} from '../testing/index.js';

const LIVE_GATE = 'STORAGE_CONFORMANCE_LIVE';
const CUSTOM_CAPABILITY_TOKENS = [
  'create',
  'replace',
  'delete',
  'read-etag',
  'read-version',
  'copy-source-etag',
  'copy-source-version',
  'copy-destination-create',
  'copy-destination-replace',
  'atomic-promotion',
  'multipart-create',
  'multipart-replace',
] as const;

type CustomCapabilityToken = (typeof CUSTOM_CAPABILITY_TOKENS)[number];

interface S3LiveConfiguration {
  readonly accessKeyId: string;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly forcePathStyle: boolean;
  readonly region: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

type GatedConfiguration<Value> =
  | {
      readonly configuration: Value;
      readonly error?: never;
      readonly missing?: never;
    }
  | {
      readonly configuration?: never;
      readonly error: Error;
      readonly missing?: never;
    }
  | {
      readonly configuration?: never;
      readonly error?: never;
      readonly missing: readonly string[];
    };

const FILESYSTEM_CAPABILITIES = Object.freeze({
  conditionalCreate: { resultEtag: true },
  conditionalReplace: { resultEtag: true },
  conditionalDelete: { etag: true },
  conditionalRead: { etag: true, version: false },
  conditionalCopySource: { etag: true, version: false },
  conditionalCopyDestination: {
    atomicWithSource: true,
    create: true,
    replace: true,
  },
  physicalKey: { maxBytes: 4096 },
} satisfies StorageProviderConformanceCapabilities);

describe('custom provider conformance declarations', () => {
  it('builds a profile from only the explicitly declared tokens', () => {
    const profile = customProfile(
      parseCustomCapabilityTokens(
        'create,read-etag,copy-source-etag,copy-destination-create,atomic-promotion,multipart-create',
      ),
      2048,
    );

    expect(capabilitiesFromProfile(profile)).toEqual({
      conditionalCreate: { resultEtag: true },
      conditionalRead: { etag: true, version: false },
      conditionalCopySource: { etag: true, version: false },
      conditionalCopyDestination: {
        atomicWithSource: true,
        create: true,
        replace: false,
      },
      conditionalMultipartCompletion: { create: true, replace: false },
      physicalKey: { maxBytes: 2048 },
      signedUploadPolicy: { contentType: false, sizeRange: false },
    });
  });

  it.each([
    'create,create',
    'unknown',
    'copy-source-etag,atomic-promotion',
    'multipart-create',
    'multipart-replace',
  ])('rejects invalid declaration %j', (declaration) => {
    expect(() => parseCustomCapabilityTokens(declaration)).toThrow(TypeError);
  });

  it('allows destination-only copy capabilities', () => {
    expect(
      capabilitiesFromProfile(
        customProfile(
          parseCustomCapabilityTokens('copy-destination-create'),
          1024,
        ),
      ),
    ).toMatchObject({
      conditionalCopyDestination: {
        atomicWithSource: false,
        create: true,
        replace: false,
      },
    });
  });

  it('disables ambient endpoint overrides for version and cleanup helpers', () => {
    const configuration: S3LiveConfiguration = {
      accessKeyId: 'test-access-key',
      bucket: 'test-bucket',
      endpoint: 'https://explicit-endpoint.example.test',
      forcePathStyle: true,
      region: 'us-east-1',
      secretAccessKey: 'test-secret-key',
    };

    expect(sdkConfiguration(configuration)).toMatchObject({
      endpoint: configuration.endpoint,
      ignoreConfiguredEndpointUrls: true,
    });
  });
});

registerConformanceSuite('Filesystem provider conformance', {
  async createFixture(): Promise<StorageProviderConformanceFixture> {
    const root = await mkdtemp(join(tmpdir(), 'rockets-storage-conformance-'));
    const createDriver = () => createFsStorageDriver({ adapter: { root } });
    const observed = observeDispatches(createDriver());
    return {
      client: new StorageClient('filesystem-conformance', observed.driver),
      close: () => rm(root, { force: true, recursive: true }),
      createReplica: () =>
        new StorageClient('filesystem-conformance', createDriver()),
      dispatchCount: observed.dispatchCount,
    };
  },
  expected: FILESYSTEM_CAPABILITIES,
  provider: 'filesystem',
});

registerGatedSuite(
  'AWS S3 provider conformance',
  loadAwsConfiguration(),
  (configuration) => ({
    createFixture: () =>
      createS3Fixture(configuration, AWS_S3_PROVIDER_PROFILE, true),
    expected: capabilitiesFromProfile(AWS_S3_PROVIDER_PROFILE),
    forbiddenErrorValues: secretValues(configuration),
    provider: 'aws-s3',
  }),
);

registerGatedSuite(
  'Cloudflare R2 provider conformance',
  loadR2Configuration(),
  (configuration) => ({
    createFixture: () =>
      createS3Fixture(configuration, CLOUDFLARE_R2_PROVIDER_PROFILE, false),
    expected: capabilitiesFromProfile(CLOUDFLARE_R2_PROVIDER_PROFILE),
    forbiddenErrorValues: secretValues(configuration),
    provider: 'cloudflare-r2',
  }),
);

registerGatedSuite(
  'Custom / MinIO-style S3 provider conformance',
  loadCustomConfiguration(),
  ({ configuration, profile }) => ({
    createFixture: () =>
      createS3Fixture(
        configuration,
        profile,
        profile.conditionalRead?.version === true ||
          profile.conditionalCopySource?.version === true,
      ),
    expected: capabilitiesFromProfile(profile),
    forbiddenErrorValues: secretValues(configuration),
    provider: 'custom-s3',
  }),
);

function registerConformanceSuite(
  name: string,
  options: StorageProviderConformanceOptions,
): void {
  describe(name, () => {
    for (const contract of createStorageProviderConformanceCases(options)) {
      it(contract.name, async (context) => {
        const result = await contract.run();
        if (result.status === 'skipped') {
          context.skip(result.reason);
        }
      });
    }
  });
}

function registerGatedSuite<Value>(
  name: string,
  gated: GatedConfiguration<Value>,
  options: (configuration: Value) => StorageProviderConformanceOptions,
): void {
  if (gated.error !== undefined) {
    describe(name, () => {
      it('has a valid explicit live-provider configuration', () => {
        throw gated.error;
      });
    });
    return;
  }
  if (gated.missing !== undefined) {
    describe.skip(`${name} [skipped: set ${gated.missing.join(', ')}]`, () => {
      it('runs the provider contract against dedicated test credentials', () =>
        undefined);
    });
    return;
  }
  registerConformanceSuite(name, options(gated.configuration));
}

async function createS3Fixture(
  configuration: S3LiveConfiguration,
  profile: Readonly<S3ProviderProfile>,
  versionAwareCleanup: boolean,
): Promise<StorageProviderConformanceFixture> {
  const createDriver = () =>
    createS3StorageDriver({
      adapter: adapterConfiguration(configuration),
      providerProfile: profile,
    });
  const observed = observeDispatches(createDriver());
  const client = new StorageClient(
    `${profile.name}-conformance`,
    observed.driver,
  );
  const createReplica = () =>
    new StorageClient(`${profile.name}-conformance`, createDriver());
  if (!versionAwareCleanup) {
    return {
      client,
      createReplica,
      dispatchCount: observed.dispatchCount,
    };
  }

  const raw = new S3Client(sdkConfiguration(configuration));
  return {
    client,
    cleanup: (keys) => deleteS3ObjectVersions(raw, configuration.bucket, keys),
    close: () => raw.destroy(),
    createReplica,
    dispatchCount: observed.dispatchCount,
    async resolveVersion(key): Promise<string | undefined> {
      const result = await raw.send(
        new HeadObjectCommand({ Bucket: configuration.bucket, Key: key }),
      );
      return result.VersionId;
    },
  };
}

function adapterConfiguration(configuration: S3LiveConfiguration) {
  return {
    bucket: configuration.bucket,
    credentials: credentials(configuration),
    forcePathStyle: configuration.forcePathStyle,
    region: configuration.region,
    ...(configuration.endpoint === undefined
      ? {}
      : { endpoint: configuration.endpoint }),
  };
}

function sdkConfiguration(configuration: S3LiveConfiguration) {
  return {
    credentials: credentials(configuration),
    forcePathStyle: configuration.forcePathStyle,
    ignoreConfiguredEndpointUrls: true,
    region: configuration.region,
    ...(configuration.endpoint === undefined
      ? {}
      : { endpoint: configuration.endpoint }),
  };
}

function credentials(configuration: S3LiveConfiguration) {
  return {
    accessKeyId: configuration.accessKeyId,
    secretAccessKey: configuration.secretAccessKey,
    ...(configuration.sessionToken === undefined
      ? {}
      : { sessionToken: configuration.sessionToken }),
  };
}

function observeDispatches(driver: StorageDriver): {
  readonly dispatchCount: () => number;
  readonly driver: StorageDriver;
} {
  let dispatches = 0;
  const observed = new Proxy(driver, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        dispatches += 1;
        return Reflect.apply(value, target, args);
      };
    },
  });
  return { dispatchCount: () => dispatches, driver: observed };
}

async function deleteS3ObjectVersions(
  client: S3Client,
  bucket: string,
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) {
    let keyMarker: string | undefined;
    let versionIdMarker: string | undefined;
    let removedVersion = false;
    do {
      const page = await client.send(
        new ListObjectVersionsCommand({
          Bucket: bucket,
          Prefix: key,
          ...(keyMarker === undefined ? {} : { KeyMarker: keyMarker }),
          ...(versionIdMarker === undefined
            ? {}
            : { VersionIdMarker: versionIdMarker }),
        }),
      );
      const objects = [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]
        .filter(
          (item): item is typeof item & { Key: string; VersionId: string } =>
            item.Key === key && item.VersionId !== undefined,
        )
        .map((item) => ({ Key: item.Key, VersionId: item.VersionId }));
      if (objects.length > 0) {
        const deleted = await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        if ((deleted.Errors?.length ?? 0) > 0) {
          throw new Error(
            'S3 conformance cleanup could not delete all test versions.',
          );
        }
        removedVersion = true;
      }
      keyMarker = page.NextKeyMarker;
      versionIdMarker = page.NextVersionIdMarker;
    } while (keyMarker !== undefined);

    if (!removedVersion) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  }
}

function capabilitiesFromProfile(
  profile: Readonly<S3ProviderProfile>,
): StorageProviderConformanceCapabilities {
  return {
    physicalKey: profile.physicalKey,
    signedUploadPolicy: profile.signedUploadPolicy,
    ...(profile.conditionalCreate === undefined
      ? {}
      : { conditionalCreate: profile.conditionalCreate }),
    ...(profile.conditionalReplace === undefined
      ? {}
      : { conditionalReplace: profile.conditionalReplace }),
    ...(profile.conditionalDelete === undefined
      ? {}
      : { conditionalDelete: profile.conditionalDelete }),
    ...(profile.conditionalRead === undefined
      ? {}
      : { conditionalRead: profile.conditionalRead }),
    ...(profile.conditionalCopySource === undefined
      ? {}
      : { conditionalCopySource: profile.conditionalCopySource }),
    ...(profile.conditionalCopyDestination === undefined
      ? {}
      : { conditionalCopyDestination: profile.conditionalCopyDestination }),
    ...(profile.conditionalMultipartCompletion === undefined
      ? {}
      : {
          conditionalMultipartCompletion:
            profile.conditionalMultipartCompletion,
        }),
  };
}

function loadAwsConfiguration(): GatedConfiguration<S3LiveConfiguration> {
  return loadS3Configuration({
    accessKeyId: 'STORAGE_CONFORMANCE_AWS_ACCESS_KEY_ID',
    bucket: 'STORAGE_CONFORMANCE_AWS_BUCKET',
    region: 'STORAGE_CONFORMANCE_AWS_REGION',
    secretAccessKey: 'STORAGE_CONFORMANCE_AWS_SECRET_ACCESS_KEY',
    sessionToken: 'STORAGE_CONFORMANCE_AWS_SESSION_TOKEN',
  });
}

function loadR2Configuration(): GatedConfiguration<S3LiveConfiguration> {
  return loadS3Configuration({
    accessKeyId: 'STORAGE_CONFORMANCE_R2_ACCESS_KEY_ID',
    bucket: 'STORAGE_CONFORMANCE_R2_BUCKET',
    endpoint: 'STORAGE_CONFORMANCE_R2_ENDPOINT',
    regionValue: 'auto',
    secretAccessKey: 'STORAGE_CONFORMANCE_R2_SECRET_ACCESS_KEY',
    sessionToken: 'STORAGE_CONFORMANCE_R2_SESSION_TOKEN',
  });
}

function loadCustomConfiguration(): GatedConfiguration<{
  readonly configuration: S3LiveConfiguration;
  readonly profile: Readonly<S3ProviderProfile>;
}> {
  const configuration = loadS3Configuration({
    accessKeyId: 'STORAGE_CONFORMANCE_CUSTOM_ACCESS_KEY_ID',
    bucket: 'STORAGE_CONFORMANCE_CUSTOM_BUCKET',
    endpoint: 'STORAGE_CONFORMANCE_CUSTOM_ENDPOINT',
    forcePathStyle: 'STORAGE_CONFORMANCE_CUSTOM_FORCE_PATH_STYLE',
    region: 'STORAGE_CONFORMANCE_CUSTOM_REGION',
    secretAccessKey: 'STORAGE_CONFORMANCE_CUSTOM_SECRET_ACCESS_KEY',
    sessionToken: 'STORAGE_CONFORMANCE_CUSTOM_SESSION_TOKEN',
  });
  const declarationNames = [
    'STORAGE_CONFORMANCE_CUSTOM_CAPABILITIES',
    'STORAGE_CONFORMANCE_CUSTOM_MAX_KEY_BYTES',
  ] as const;
  const declarations = declarationNames.flatMap((name) =>
    environmentValue(name) === undefined ? [name] : [],
  );
  if (configuration.missing !== undefined || declarations.length > 0) {
    return {
      missing: [...(configuration.missing ?? []), ...declarations],
    };
  }
  if (configuration.error !== undefined) return { error: configuration.error };

  try {
    const tokens = parseCustomCapabilityTokens(
      requiredEnvironmentValue('STORAGE_CONFORMANCE_CUSTOM_CAPABILITIES'),
    );
    const maxBytes = Number(
      requiredEnvironmentValue('STORAGE_CONFORMANCE_CUSTOM_MAX_KEY_BYTES'),
    );
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
      throw new TypeError(
        'STORAGE_CONFORMANCE_CUSTOM_MAX_KEY_BYTES must be a positive safe integer.',
      );
    }
    return {
      configuration: {
        configuration: configuration.configuration,
        profile: customProfile(tokens, maxBytes),
      },
    };
  } catch (error: unknown) {
    return {
      error:
        error instanceof Error
          ? error
          : new TypeError('Custom provider declarations are invalid.'),
    };
  }
}

function loadS3Configuration(names: {
  readonly accessKeyId: string;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: string;
  readonly region?: string;
  readonly regionValue?: string;
  readonly secretAccessKey: string;
  readonly sessionToken: string;
}): GatedConfiguration<S3LiveConfiguration> {
  const missing: string[] = [];
  if (environmentValue(LIVE_GATE) !== 'true') {
    missing.push(`${LIVE_GATE}=true`);
  }
  const accessKeyId = requireNamedEnvironment(names.accessKeyId, missing);
  const bucket = requireNamedEnvironment(names.bucket, missing);
  const secretAccessKey = requireNamedEnvironment(
    names.secretAccessKey,
    missing,
  );
  const endpoint = optionalNamedEnvironment(names.endpoint);
  if (names.endpoint !== undefined && endpoint === undefined) {
    missing.push(names.endpoint);
  }
  const region =
    names.regionValue ?? requireNamedEnvironment(names.region ?? '', missing);
  if (missing.length > 0) return { missing: [...new Set(missing)] };

  let forcePathStyle = false;
  if (names.forcePathStyle !== undefined) {
    const configured = environmentValue(names.forcePathStyle) ?? 'true';
    if (configured !== 'true' && configured !== 'false') {
      return {
        error: new TypeError(`${names.forcePathStyle} must be true or false.`),
      };
    }
    forcePathStyle = configured === 'true';
  }
  const sessionToken = environmentValue(names.sessionToken);
  return {
    configuration: {
      accessKeyId,
      bucket,
      forcePathStyle,
      region,
      secretAccessKey,
      ...(endpoint === undefined ? {} : { endpoint }),
      ...(sessionToken === undefined ? {} : { sessionToken }),
    },
  };
}

function customProfile(
  tokens: ReadonlySet<CustomCapabilityToken>,
  maxBytes: number,
): Readonly<S3ProviderProfile> {
  const copySource =
    tokens.has('copy-source-etag') || tokens.has('copy-source-version');
  const copyDestination =
    tokens.has('copy-destination-create') ||
    tokens.has('copy-destination-replace') ||
    tokens.has('atomic-promotion');
  const conditionalRead = tokens.has('read-etag') || tokens.has('read-version');
  const multipart =
    tokens.has('multipart-create') || tokens.has('multipart-replace');
  return defineS3ProviderProfile({
    name: 'custom-explicit-conformance',
    physicalKey: { maxBytes },
    ...(tokens.has('create')
      ? { conditionalCreate: { resultEtag: true } }
      : {}),
    ...(tokens.has('replace')
      ? { conditionalReplace: { resultEtag: true } }
      : {}),
    ...(tokens.has('delete') ? { conditionalDelete: { etag: true } } : {}),
    ...(conditionalRead
      ? {
          conditionalRead: {
            etag: tokens.has('read-etag'),
            version: tokens.has('read-version'),
          },
        }
      : {}),
    ...(copySource
      ? {
          conditionalCopySource: {
            etag: tokens.has('copy-source-etag'),
            version: tokens.has('copy-source-version'),
          },
        }
      : {}),
    ...(copyDestination
      ? {
          conditionalCopyDestination: {
            atomicWithSource: tokens.has('atomic-promotion'),
            create: tokens.has('copy-destination-create'),
            replace: tokens.has('copy-destination-replace'),
          },
        }
      : {}),
    ...(multipart
      ? {
          conditionalMultipartCompletion: {
            create: tokens.has('multipart-create'),
            replace: tokens.has('multipart-replace'),
          },
        }
      : {}),
  });
}

function parseCustomCapabilityTokens(
  input: string,
): ReadonlySet<CustomCapabilityToken> {
  const known = new Set<string>(CUSTOM_CAPABILITY_TOKENS);
  const parsed = input.split(',').map((token) => token.trim());
  if (parsed.length === 0 || parsed.some((token) => token.length === 0)) {
    throw new TypeError(
      'STORAGE_CONFORMANCE_CUSTOM_CAPABILITIES must contain comma-separated tokens.',
    );
  }
  const tokens = new Set<CustomCapabilityToken>();
  for (const token of parsed) {
    if (!known.has(token)) {
      throw new TypeError(
        `STORAGE_CONFORMANCE_CUSTOM_CAPABILITIES contains unknown token ${JSON.stringify(
          token,
        )}.`,
      );
    }
    if (tokens.has(token as CustomCapabilityToken)) {
      throw new TypeError(
        `STORAGE_CONFORMANCE_CUSTOM_CAPABILITIES repeats token ${JSON.stringify(
          token,
        )}.`,
      );
    }
    tokens.add(token as CustomCapabilityToken);
  }
  if (
    tokens.has('atomic-promotion') &&
    !tokens.has('copy-source-etag') &&
    !tokens.has('copy-source-version')
  ) {
    throw new TypeError(
      'atomic-promotion requires a copy-source-etag or copy-source-version token.',
    );
  }
  if (
    tokens.has('atomic-promotion') &&
    !tokens.has('copy-destination-create') &&
    !tokens.has('copy-destination-replace')
  ) {
    throw new TypeError(
      'atomic-promotion requires a copy-destination-create or copy-destination-replace token.',
    );
  }
  if (tokens.has('multipart-create') && !tokens.has('create')) {
    throw new TypeError('multipart-create requires the create token.');
  }
  if (tokens.has('multipart-replace') && !tokens.has('replace')) {
    throw new TypeError('multipart-replace requires the replace token.');
  }
  return tokens;
}

function requireNamedEnvironment(name: string, missing: string[]): string {
  const value = environmentValue(name);
  if (value === undefined) missing.push(name);
  return value ?? '';
}

function optionalNamedEnvironment(
  name: string | undefined,
): string | undefined {
  return name === undefined ? undefined : environmentValue(name);
}

function requiredEnvironmentValue(name: string): string {
  const value = environmentValue(name);
  if (value === undefined) {
    throw new TypeError(`${name} is required.`);
  }
  return value;
}

function environmentValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function secretValues(configuration: S3LiveConfiguration): readonly string[] {
  return [
    configuration.accessKeyId,
    configuration.secretAccessKey,
    configuration.sessionToken ?? '',
  ];
}
