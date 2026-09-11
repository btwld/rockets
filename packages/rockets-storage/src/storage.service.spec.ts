import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { StorageErrorCode } from './storage.error.js';
import { StorageModule } from './storage.module.js';
import { StorageService } from './storage.service.js';
import { createMemoryStorageDriver } from './testing/index.js';

describe('StorageService cross-store operations', () => {
  it('streams transfers and reports skipped objects', async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          default: 'source',
          stores: [
            {
              driver: createMemoryStorageDriver({
                adapter: {
                  initial: {
                    'one.txt': 'one',
                    'two.txt': 'two',
                  },
                },
              }),
              name: 'source',
            },
            {
              driver: createMemoryStorageDriver({
                adapter: { initial: { 'backup/one.txt': 'existing' } },
              }),
              name: 'destination',
            },
          ],
        }),
      ],
    }).compile();
    const storage = module.get(StorageService);
    const progress: string[] = [];

    const result = await storage.transfer({
      from: 'source',
      onProgress: ({ key, status }) => {
        progress.push(`${status}:${key}`);
      },
      overwrite: false,
      to: 'destination',
      transformKey: (key) => `backup/${key}`,
    });

    expect(result).toEqual({
      skipped: ['one.txt'],
      transferred: ['two.txt'],
    });
    expect(progress.sort()).toEqual(['skipped:one.txt', 'transferred:two.txt']);
    await expect(
      storage.use('destination').downloadText('backup/two.txt'),
    ).resolves.toBe('two');
    await module.close();
  });

  it('supports dry-run and pruning sync plans', async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          stores: [
            {
              driver: createMemoryStorageDriver({
                adapter: { initial: { 'current.txt': 'new' } },
              }),
              name: 'source',
            },
            {
              driver: createMemoryStorageDriver({
                adapter: {
                  initial: {
                    'current.txt': 'outdated',
                    'stale.txt': 'stale',
                  },
                },
              }),
              name: 'destination',
            },
          ],
        }),
      ],
    }).compile();
    const storage = module.get(StorageService);

    await expect(
      storage.sync({
        compare: 'size',
        dryRun: true,
        from: 'source',
        prune: true,
        to: 'destination',
      }),
    ).resolves.toEqual({
      deleted: ['stale.txt'],
      skipped: [],
      uploaded: ['current.txt'],
    });

    const applied = await storage.sync({
      compare: 'etag',
      from: 'source',
      prune: true,
      to: 'destination',
    });
    expect(applied.deleted).toEqual(['stale.txt']);
    expect(applied.uploaded).toEqual(['current.txt']);
    await expect(storage.use('destination').exists('stale.txt')).resolves.toBe(
      false,
    );
    await module.close();
  });

  it('writes, compares, and prunes inside destinationPrefix', async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          stores: [
            {
              driver: createMemoryStorageDriver({
                adapter: { initial: { 'current.txt': 'new' } },
              }),
              name: 'source',
            },
            {
              driver: createMemoryStorageDriver({
                adapter: { initial: { 'workspace/stale.txt': 'stale' } },
              }),
              name: 'destination',
            },
          ],
        }),
      ],
    }).compile();
    const storage = module.get(StorageService);

    const result = await storage.sync({
      destinationPrefix: 'workspace/',
      from: 'source',
      prune: true,
      to: 'destination',
      transformKey: (key) => `nested/${key}`,
    });

    expect(result).toEqual({
      deleted: ['workspace/stale.txt'],
      skipped: [],
      uploaded: ['current.txt'],
    });
    await expect(
      storage.use('destination').downloadText('workspace/nested/current.txt'),
    ).resolves.toBe('new');
    await expect(
      storage.use('destination').exists('nested/current.txt'),
    ).resolves.toBe(false);
    await module.close();
  });

  it('rejects transformed keys that could escape destinationPrefix', async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          stores: [
            {
              driver: createMemoryStorageDriver({
                adapter: { initial: { 'source.txt': 'source' } },
              }),
              name: 'source',
            },
            {
              driver: createMemoryStorageDriver(),
              name: 'destination',
            },
          ],
        }),
      ],
    }).compile();
    const storage = module.get(StorageService);

    await expect(
      storage.sync({
        destinationPrefix: 'workspace/',
        from: 'source',
        to: 'destination',
        transformKey: () => '../outside.txt',
      }),
    ).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
    });
    await expect(
      storage.use('destination').exists('outside.txt'),
    ).resolves.toBe(false);
    await module.close();
  });

  it('rejects unsafe same-store transfer', async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          stores: [
            {
              driver: createMemoryStorageDriver(),
              name: 'only',
            },
          ],
        }),
      ],
    }).compile();
    const storage = module.get(StorageService);

    await expect(
      storage.transfer({ from: 'only', to: 'only' }),
    ).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
    });
    await module.close();
  });
});
