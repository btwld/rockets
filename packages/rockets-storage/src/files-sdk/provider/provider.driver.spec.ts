import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { S3Client } from '@aws-sdk/client-s3';

import { StorageClient } from '../../storage.client.js';
import { StorageErrorCode } from '../../storage.error.js';
import { defineS3ProviderProfile } from '../s3/index.js';
import {
  createProviderStorageDriver,
  getStorageProvider,
  isStorageProvider,
  listStorageProviderEnvVars,
  listStorageProviderSecretEnvVars,
  listStorageProviders,
} from './index.js';

describe('createProviderStorageDriver', () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rockets-storage-provider-'));
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  it('builds a working driver from a provider named at runtime', async () => {
    const client = new StorageClient(
      'artifacts',
      await createProviderStorageDriver({
        config: { root },
        provider: 'fs',
      }),
    );

    await client.upload('index.html', '<html>named</html>');

    expect(readFileSync(join(root, 'index.html'), 'utf8')).toBe(
      '<html>named</html>',
    );
  });

  it('applies the caller driver options to the resolved adapter', async () => {
    const client = new StorageClient(
      'artifacts',
      await createProviderStorageDriver({
        config: { root },
        prefix: 'tenant-b',
        provider: 'fs',
      }),
    );

    await client.upload('report.txt', 'scoped');

    expect(readFileSync(join(root, 'tenant-b/report.txt'), 'utf8')).toBe(
      'scoped',
    );
  });

  it('honors a readonly driver regardless of provider', async () => {
    const client = new StorageClient(
      'artifacts',
      await createProviderStorageDriver({
        config: { root },
        provider: 'fs',
        readonly: true,
      }),
    );

    await expect(client.upload('blocked.txt', 'nope')).rejects.toMatchObject({
      code: StorageErrorCode.READ_ONLY,
    });
  });

  it('adds the S3-only capabilities for the s3 slug', async () => {
    const driver = await createProviderStorageDriver({
      config: {
        accessKeyId: 'test',
        bucket: 'artifacts',
        region: 'us-east-1',
        secretAccessKey: 'test',
      },
      provider: 's3',
      readonly: false,
    });

    expect(driver.capabilities.conditionalCreate).toEqual({
      resultEtag: true,
    });
    expect(driver.capabilities.conditionalReplace).toEqual({
      resultEtag: true,
    });
    expect(driver.capabilities.conditionalDelete).toEqual({
      etag: true,
    });
    expect(driver.capabilities.conditionalRead).toEqual({
      etag: true,
      version: true,
    });
    expect(driver.capabilities.conditionalCopySource).toEqual({
      etag: true,
      version: true,
    });
    expect(driver.capabilities.conditionalCopyDestination).toEqual({
      atomicWithSource: true,
      create: true,
      replace: true,
    });
    expect(driver.capabilities.conditionalMultipartCompletion).toEqual({
      create: true,
      replace: true,
    });
    expect(driver.capabilities.physicalKey).toEqual({ maxBytes: 1_024 });
    expect(driver.capabilities.signedUploadPolicy).toEqual({
      contentType: true,
      sizeRange: true,
    });
    expect(driver.capabilities.signedDownloadPolicy).toEqual({
      expiresIn: true,
      maxExpiresIn: 604_800,
    });
  });

  it('rejects a native S3 profile that widens the AWS key ceiling before dispatch', async () => {
    const send = vi.spyOn(S3Client.prototype, 'send');
    try {
      await expect(
        createProviderStorageDriver({
          config: {
            accessKeyId: 'test',
            bucket: 'artifacts',
            region: 'us-east-1',
            secretAccessKey: 'test',
          },
          provider: 's3',
          s3ProviderProfile: defineS3ProviderProfile({
            name: 'invalid-widened-provider-native',
            physicalKey: { maxBytes: 2048 },
          }),
        }),
      ).rejects.toThrow(
        /cannot widen aws-s3-general-purpose physicalKey\.maxBytes/u,
      );
      expect(send).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
    }
  });

  it('forces a configJson-resolved unverified S3 endpoint read-only without dispatch', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockRejectedValue(new Error('unexpected S3 dispatch') as never);
    const driver = await createProviderStorageDriver({
      config: {
        accessKeyId: 'test',
        bucket: 'artifacts',
        configJson: {
          endpoint: 'https://objects.example.test',
          publicBaseUrl: 'https://cdn.example.test',
        },
        region: 'us-east-1',
        secretAccessKey: 'test',
      },
      provider: 's3',
      readonly: false,
    });

    expect(driver.capabilities.conditionalCreate).toBeUndefined();
    expect(driver.capabilities.conditionalReplace).toBeUndefined();
    expect(driver.capabilities.conditionalDelete).toBeUndefined();
    expect(driver.capabilities.conditionalRead).toBeUndefined();
    expect(driver.capabilities.conditionalCopySource).toBeUndefined();
    expect(driver.capabilities.conditionalCopyDestination).toBeUndefined();
    expect(driver.capabilities.conditionalMultipartCompletion).toBeUndefined();
    expect(driver.capabilities.physicalKey).toEqual({ maxBytes: 1_024 });
    expect(driver.capabilities.resumableUpload).toBe(false);
    expect(driver.capabilities.serverSideCopy).toBe(false);
    expect(driver.capabilities.signedUpload).toBe(false);
    expect(driver.capabilities.signedUploadPolicy).toBeUndefined();
    expect(driver.capabilities.signedDownloadPolicy).toEqual({
      expiresIn: false,
      maxExpiresIn: 604_800,
    });
    expect(driver.capabilities.nativeUploadProgress).toBe(false);
    const client = new StorageClient('unverified-provider', driver);
    try {
      const mutations = [
        () => client.upload('blocked.txt', 'blocked'),
        () => client.delete('blocked.txt'),
        () => client.copy('source.txt', 'destination.txt'),
        () => client.move('source.txt', 'destination.txt'),
        () => client.signUpload('blocked.txt', { expiresIn: 60 }),
      ];
      for (const mutate of mutations) {
        await expect(mutate()).rejects.toMatchObject({
          code: StorageErrorCode.READ_ONLY,
        });
      }
      expect(send).not.toHaveBeenCalled();
    } finally {
      await client.onApplicationShutdown();
      send.mockRestore();
    }
  });

  it('forces a named S3-backed provider unverified and read-only', async () => {
    const send = vi
      .spyOn(S3Client.prototype, 'send')
      .mockRejectedValue(new Error('unexpected S3 dispatch') as never);
    const driver = await createProviderStorageDriver({
      config: {
        accessKeyId: 'test',
        bucket: 'artifacts',
        endpoint: 'https://minio.example.test',
        region: 'us-east-1',
        secretAccessKey: 'test',
      },
      provider: 'minio',
      readonly: false,
    });

    expect(driver.capabilities.conditionalCreate).toBeUndefined();
    expect(driver.capabilities.conditionalRead).toBeUndefined();
    expect(driver.capabilities.physicalKey).toEqual({ maxBytes: 1_024 });
    expect(driver.capabilities.signedUpload).toBe(false);
    expect(driver.capabilities.signedDownloadPolicy).toEqual({
      expiresIn: false,
      maxExpiresIn: 604_800,
    });
    const client = new StorageClient('unverified-minio', driver);
    try {
      await expect(
        client.upload('blocked.txt', 'blocked'),
      ).rejects.toMatchObject({
        code: StorageErrorCode.READ_ONLY,
      });
      expect(send).not.toHaveBeenCalled();
    } finally {
      await client.onApplicationShutdown();
      send.mockRestore();
    }
  });

  it('forwards an explicit verified profile to a custom S3 endpoint', async () => {
    const driver = await createProviderStorageDriver({
      config: {
        accessKeyId: 'test',
        bucket: 'artifacts',
        configJson: { endpoint: 'https://objects.example.test' },
        region: 'us-east-1',
        secretAccessKey: 'test',
      },
      provider: 's3',
      s3ProviderProfile: defineS3ProviderProfile({
        name: 'verified-custom',
        physicalKey: { maxBytes: 512 },
        conditionalCreate: { resultEtag: true },
      }),
    });

    expect(driver.capabilities.conditionalCreate).toEqual({
      resultEtag: true,
    });
    expect(driver.capabilities.conditionalReplace).toBeUndefined();
    expect(driver.capabilities.physicalKey).toEqual({ maxBytes: 512 });
    expect(driver.capabilities.signedUpload).toBe('runtime');
    expect(driver.capabilities.signedUploadPolicy).toEqual({
      contentType: false,
      sizeRange: false,
    });
  });

  it('rejects an S3 profile for a different provider', async () => {
    await expect(
      createProviderStorageDriver({
        config: { root },
        provider: 'fs',
        s3ProviderProfile: defineS3ProviderProfile({
          name: 'wrong-provider',
          physicalKey: { maxBytes: 512 },
        }),
      }),
    ).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
      permanent: true,
    });
  });

  it('exposes the filesystem provider exact conditional capabilities', async () => {
    const driver = await createProviderStorageDriver({
      config: { root },
      provider: 'fs',
    });

    expect(driver.capabilities.conditionalCreate).toEqual({
      resultEtag: true,
    });
    expect(driver.capabilities.conditionalReplace).toEqual({
      resultEtag: true,
    });
    expect(driver.capabilities.conditionalDelete).toEqual({ etag: true });
    expect(driver.capabilities.conditionalRead).toEqual({
      etag: true,
      version: false,
    });
    expect(driver.capabilities.conditionalCopySource).toEqual({
      etag: true,
      version: false,
    });
    expect(driver.capabilities.conditionalCopyDestination).toEqual({
      atomicWithSource: true,
      create: true,
      replace: true,
    });
    expect(driver.capabilities.conditionalMultipartCompletion).toBeUndefined();
    expect(driver.capabilities.physicalKey).toEqual({ maxBytes: 4_096 });
  });

  it('rejects an unknown slug before importing anything', async () => {
    await expect(
      createProviderStorageDriver({
        provider: 'not-a-provider' as never,
      }),
    ).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
      permanent: true,
    });
  });
});

describe('storage provider catalog', () => {
  it('narrows an untrusted string to a known slug', () => {
    expect(isStorageProvider('gcs')).toBe(true);
    expect(isStorageProvider('not-a-provider')).toBe(false);
  });

  it('lists the providers a deployment can choose between', () => {
    const slugs = listStorageProviders().map((provider) => provider.slug);

    expect(slugs).toEqual([...slugs].sort());
    expect(slugs).toEqual(expect.arrayContaining(['azure', 'fs', 'gcs', 's3']));
  });

  it('describes the native SDKs a provider needs', () => {
    expect(getStorageProvider('gcs')?.peerDeps).toContain(
      '@google-cloud/storage',
    );
    expect(getStorageProvider('fs')?.peerDeps).toEqual([]);
    expect(getStorageProvider('not-a-provider')).toBeUndefined();
  });

  it('reports the env contract and which of it is secret', () => {
    const keys = listStorageProviderEnvVars('s3').map(
      (variable) => variable.key,
    );
    const secrets = listStorageProviderSecretEnvVars('s3').map(
      (variable) => variable.key,
    );

    expect(keys).toContain('AWS_REGION');
    expect(secrets).toContain('AWS_SECRET_ACCESS_KEY');
    expect(secrets).not.toContain('AWS_REGION');
    expect(secrets.every((key) => keys.includes(key))).toBe(true);
  });
});
