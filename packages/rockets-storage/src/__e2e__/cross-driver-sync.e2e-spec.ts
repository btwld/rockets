import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createFsStorageDriver } from '../files-sdk/fs/index.js';
import { StorageErrorCode } from '../storage.error.js';
import { StorageModule } from '../storage.module.js';
import { StorageService } from '../storage.service.js';
import { createMemoryStorageDriver } from '../testing/index.js';

describe('cross-driver sync', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function bootstrap(): Promise<StorageService> {
    const root = await mkdtemp(join(tmpdir(), 'rockets-storage-sync-'));
    const testingModule = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          default: 'source',
          stores: [
            {
              driver: createMemoryStorageDriver({
                adapter: { initial: { 'report.txt': 'identical' } },
              }),
              name: 'source',
            },
            {
              driver: createFsStorageDriver({ adapter: { root } }),
              name: 'destination',
            },
          ],
        }),
      ],
    }).compile();
    cleanup = async () => {
      await testingModule.close();
      await rm(root, { force: true, recursive: true });
    };
    return testingModule.get(StorageService);
  }

  it('refuses an implicit etag comparison across two drivers', async () => {
    const storage = await bootstrap();

    await expect(
      storage.sync({ from: 'source', to: 'destination' }),
    ).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
      store: 'destination',
    });
  });

  it('skips unchanged objects once the comparison is explicit', async () => {
    const storage = await bootstrap();

    await expect(
      storage.sync({ compare: 'size', from: 'source', to: 'destination' }),
    ).resolves.toEqual({ skipped: [], uploaded: ['report.txt'] });

    await expect(
      storage.sync({ compare: 'size', from: 'source', to: 'destination' }),
    ).resolves.toEqual({ skipped: ['report.txt'], uploaded: [] });

    const [source, destination] = await Promise.all([
      storage.use('source').head('report.txt'),
      storage.use('destination').head('report.txt'),
    ]);
    expect(source.etag).not.toBe(destination.etag);
  });
});
