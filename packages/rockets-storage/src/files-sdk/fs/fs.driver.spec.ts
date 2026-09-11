import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { StorageClient } from '../../storage.client.js';
import { StorageErrorCode } from '../../storage.error.js';
import { createFsStorageDriver } from './index.js';

describe('createFsStorageDriver', () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rockets-storage-fs-'));
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  it('stores the body verbatim at the key path under the root', async () => {
    const client = new StorageClient(
      'artifacts',
      createFsStorageDriver({ adapter: { root } }),
    );

    await client.upload('nested/page.html', '<html>hi</html>', {
      contentType: 'text/html; charset=utf-8',
    });

    expect(readFileSync(join(root, 'nested/page.html'), 'utf8')).toBe(
      '<html>hi</html>',
    );
    const head = await client.head('nested/page.html');
    expect(head.contentType).toBe('text/html; charset=utf-8');
  });

  it('keeps sidecars out of listings', async () => {
    const client = new StorageClient(
      'artifacts',
      createFsStorageDriver({ adapter: { root } }),
    );
    await client.upload('a.txt', 'a');
    await client.upload('b.txt', 'b');

    const listed = await client.list();

    expect(listed.items.map((item) => item.key).sort()).toEqual([
      'a.txt',
      'b.txt',
    ]);
  });

  it('scopes every key under the configured prefix', async () => {
    const client = new StorageClient(
      'artifacts',
      createFsStorageDriver({ adapter: { root }, prefix: 'tenant-a' }),
    );

    await client.upload('report.txt', 'scoped');

    expect(readFileSync(join(root, 'tenant-a/report.txt'), 'utf8')).toBe(
      'scoped',
    );
    const listed = await client.list();
    expect(listed.items.map((item) => item.key)).toEqual(['report.txt']);
  });

  it('reports a missing object as NOT_FOUND', async () => {
    const client = new StorageClient(
      'artifacts',
      createFsStorageDriver({ adapter: { root } }),
    );

    await expect(client.downloadBytes('absent.bin')).rejects.toMatchObject({
      code: StorageErrorCode.NOT_FOUND,
    });
  });

  it('rejects reads through a symlink that aliases another mounted prefix', async () => {
    mkdirSync(join(root, 'scope'), { recursive: true });
    mkdirSync(join(root, 'outside'), { recursive: true });
    writeFileSync(join(root, 'outside/secret.txt'), 'secret');
    symlinkSync(
      join(root, 'outside/secret.txt'),
      join(root, 'scope/link.txt'),
      'file',
    );
    const client = new StorageClient(
      'artifacts',
      createFsStorageDriver({ adapter: { root } }),
    );

    await expect(client.downloadText('scope/link.txt')).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
    });
    await expect(client.head('scope/link.txt')).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
    });
    await expect(client.exists('scope/link.txt')).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
    });
  });

  it('rejects reads through a hard link that aliases another mounted prefix', async () => {
    mkdirSync(join(root, 'scope'), { recursive: true });
    mkdirSync(join(root, 'outside'), { recursive: true });
    writeFileSync(join(root, 'outside/secret.txt'), 'secret');
    linkSync(join(root, 'outside/secret.txt'), join(root, 'scope/link.txt'));
    const client = new StorageClient(
      'artifacts',
      createFsStorageDriver({ adapter: { root } }),
    );

    await expect(client.downloadText('scope/link.txt')).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
    });
    await expect(client.head('scope/link.txt')).rejects.toMatchObject({
      code: StorageErrorCode.INVALID_ARGUMENT,
    });
  });

  it('supports create, replace, and delete with exact ETag preconditions', async () => {
    const client = new StorageClient(
      'artifacts',
      createFsStorageDriver({ adapter: { root } }),
    );

    expect(client.capabilities.conditionalCreate).toEqual({
      resultEtag: true,
    });
    expect(client.capabilities.conditionalReplace).toEqual({
      resultEtag: true,
    });
    expect(client.capabilities.conditionalDelete).toEqual({
      etag: true,
    });
    const created = await client.uploadConditional('note.txt', 'first', {
      condition: { type: 'create' },
    });

    await expect(
      client.uploadConditional('note.txt', 'duplicate', {
        condition: { type: 'create' },
      }),
    ).rejects.toMatchObject({ code: StorageErrorCode.CONFLICT });
    await expect(
      client.uploadConditional('note.txt', 'wrong', {
        condition: { etag: 'wrong-etag', type: 'replace' },
      }),
    ).rejects.toMatchObject({ code: StorageErrorCode.CONFLICT });
    await expect(client.downloadText('note.txt')).resolves.toBe('first');

    const replaced = await client.uploadConditional('note.txt', 'second', {
      condition: { etag: created.etag ?? '', type: 'replace' },
    });
    await expect(client.downloadText('note.txt')).resolves.toBe('second');
    await expect(
      client.deleteConditional('note.txt', {
        condition: { etag: created.etag ?? '' },
      }),
    ).rejects.toMatchObject({ code: StorageErrorCode.CONFLICT });

    await client.deleteConditional('note.txt', {
      condition: { etag: replaced.etag ?? '' },
    });
    await expect(client.exists('note.txt')).resolves.toBe(false);
  });

  it('serializes conditional creates across drivers for the same root', async () => {
    const first = new StorageClient(
      'first',
      createFsStorageDriver({ adapter: { root } }),
    );
    const second = new StorageClient(
      'second',
      createFsStorageDriver({ adapter: { root } }),
    );

    const settled = await Promise.allSettled([
      first.uploadConditional('race.txt', 'first', {
        condition: { type: 'create' },
      }),
      second.uploadConditional('race.txt', 'second', {
        condition: { type: 'create' },
      }),
    ]);

    expect(
      settled.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      settled.filter((result) => result.status === 'rejected'),
    ).toMatchObject([{ reason: { code: StorageErrorCode.CONFLICT } }]);
  });

  it('does not advertise conditional mutations from a readonly filesystem driver', () => {
    const driver = createFsStorageDriver({
      adapter: { root },
      readonly: true,
    });

    expect(driver.capabilities.conditionalCreate).toBeUndefined();
    expect(driver.capabilities.conditionalReplace).toBeUndefined();
    expect(driver.capabilities.conditionalDelete).toBeUndefined();
    expect(driver.capabilities.conditionalCopySource).toBeUndefined();
    expect(driver.capabilities.conditionalCopyDestination).toBeUndefined();
    expect(driver.capabilities.conditionalRead).toEqual({
      etag: true,
      version: false,
    });
  });

  it('rejects a parent symlink during conditional create', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'rockets-storage-outside-'));
    try {
      symlinkSync(outside, join(root, 'link'), 'dir');
      const client = new StorageClient(
        'artifacts',
        createFsStorageDriver({ adapter: { root } }),
      );

      await expect(
        client.uploadConditional('link/new.txt', 'escaped', {
          condition: { type: 'create' },
        }),
      ).rejects.toMatchObject({ code: StorageErrorCode.INVALID_ARGUMENT });
      expect(existsSync(join(outside, 'new.txt'))).toBe(false);
    } finally {
      rmSync(outside, { force: true, recursive: true });
    }
  });

  it('rejects a body symlink during conditional replace', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'rockets-storage-outside-'));
    try {
      const outsideFile = join(outside, 'target.txt');
      writeFileSync(outsideFile, 'outside');
      symlinkSync(outsideFile, join(root, 'note.txt'), 'file');
      writeFileSync(
        join(root, 'note.txt.meta.json'),
        JSON.stringify({
          contentType: 'text/plain',
          etag: 'outside-etag',
          lastModified: Date.now(),
        }),
      );
      const client = new StorageClient(
        'artifacts',
        createFsStorageDriver({ adapter: { root } }),
      );

      await expect(
        client.uploadConditional('note.txt', 'escaped', {
          condition: { etag: 'outside-etag', type: 'replace' },
        }),
      ).rejects.toMatchObject({ code: StorageErrorCode.INVALID_ARGUMENT });
      expect(readFileSync(outsideFile, 'utf8')).toBe('outside');
    } finally {
      rmSync(outside, { force: true, recursive: true });
    }
  });

  it('rejects a sidecar symlink during conditional delete', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'rockets-storage-outside-'));
    try {
      const outsideSidecar = join(outside, 'metadata.json');
      writeFileSync(outsideSidecar, '{"etag":"outside-etag"}');
      writeFileSync(join(root, 'note.txt'), 'inside');
      symlinkSync(outsideSidecar, join(root, 'note.txt.meta.json'), 'file');
      const client = new StorageClient(
        'artifacts',
        createFsStorageDriver({ adapter: { root } }),
      );

      await expect(
        client.deleteConditional('note.txt', {
          condition: { etag: 'outside-etag' },
        }),
      ).rejects.toMatchObject({ code: StorageErrorCode.INVALID_ARGUMENT });
      expect(readFileSync(join(root, 'note.txt'), 'utf8')).toBe('inside');
      expect(readFileSync(outsideSidecar, 'utf8')).toBe(
        '{"etag":"outside-etag"}',
      );
    } finally {
      rmSync(outside, { force: true, recursive: true });
    }
  });
});
