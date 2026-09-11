import { Readable } from 'node:stream';
import { inspect } from 'node:util';
import { describe, expect, it, vi } from 'vitest';

import { createStoredFile, handlers, type FilesHooks } from 'files-sdk';
import { memory } from 'files-sdk/memory';

import {
  StorageError,
  StorageErrorCode,
  isStorageError,
  type StorageError as StorageErrorType,
} from '../storage.error.js';
import {
  createFilesSdkDriver,
  markFilesSdkS3AdapterProvenance,
  markFilesSdkS3AdapterUndecorated,
} from './files-sdk.driver.js';

async function rejectedStorageError(
  operation: () => Promise<unknown>,
): Promise<StorageErrorType> {
  try {
    await operation();
  } catch (error: unknown) {
    if (isStorageError(error)) return error;
    throw error;
  }
  throw new Error('Expected storage operation to reject.');
}

function logShape(error: StorageErrorType): string {
  return `${inspect(error, { depth: null })}\n${JSON.stringify({ error })}`;
}

function s3BackedMemoryAdapter(name = 's3') {
  return Object.assign(memory(), {
    name,
    raw: {
      config: { serviceId: 'S3' },
      send: vi.fn(),
    },
  });
}

describe('FilesSdkStorageDriver', () => {
  it('maps a not-found FilesError from another package copy without retaining provider details', async () => {
    const providerMessage = 'missing object request-id=secret-not-found';
    class ForeignFilesError extends Error {
      override readonly name = 'FilesError';
      readonly code = 'NotFound';
      readonly aborted = false;
      readonly timedOut = false;
      readonly permanent = true;
    }

    const adapter = memory();
    adapter.head = async () => {
      throw Object.assign(new ForeignFilesError(providerMessage), {
        cause: { providerBody: providerMessage },
      });
    };
    const driver = createFilesSdkDriver({ adapter });

    const error = await rejectedStorageError(() => driver.head('missing.bin'));
    expect(error).toMatchObject({
      cause: undefined,
      code: StorageErrorCode.NOT_FOUND,
      message: 'Storage provider object was not found.',
      permanent: true,
    });
    expect(logShape(error)).not.toContain(providerMessage);
  });

  it('redacts unauthorized and generic provider errors while preserving flags', async () => {
    const unauthorizedDetail = 'secret unauthorized XML request-id=private';
    const providerDetail = 'secret provider body host-id=private';
    const adapter = memory();
    adapter.head = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error(unauthorizedDetail), {
          aborted: false,
          cause: { providerBody: unauthorizedDetail },
          code: 'Unauthorized',
          name: 'FilesError',
          permanent: true,
          timedOut: false,
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error(providerDetail), {
          code: 'NotFound',
          requestId: providerDetail,
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('secret aborted provider detail'), {
          aborted: true,
          code: 'Provider',
          name: 'FilesError',
          permanent: false,
          timedOut: false,
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('secret timeout provider detail'), {
          aborted: false,
          code: 'Provider',
          name: 'FilesError',
          permanent: false,
          timedOut: true,
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('secret nested storage detail'), {
          aborted: false,
          cause: new StorageError('secret nested storage detail', {
            cause: { requestId: 'secret nested request id' },
            code: StorageErrorCode.UNAUTHORIZED,
            permanent: true,
          }),
          code: 'Provider',
          name: 'FilesError',
          permanent: false,
          timedOut: false,
        }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error('secret flagged nested storage detail'), {
          aborted: true,
          cause: new StorageError('secret flagged nested storage detail', {
            cause: { requestId: 'secret flagged nested request id' },
            code: StorageErrorCode.NOT_FOUND,
            permanent: true,
          }),
          code: 'Provider',
          name: 'FilesError',
          permanent: false,
          timedOut: true,
        }),
      );
    const driver = createFilesSdkDriver({ adapter });

    const unauthorized = await rejectedStorageError(() =>
      driver.head('unauthorized.bin'),
    );
    expect(unauthorized).toMatchObject({
      aborted: false,
      cause: undefined,
      code: StorageErrorCode.UNAUTHORIZED,
      message: 'Storage provider operation was unauthorized.',
      permanent: true,
      timedOut: false,
    });
    const provider = await rejectedStorageError(() =>
      driver.head('unknown.bin'),
    );
    expect(provider).toMatchObject({
      cause: undefined,
      code: StorageErrorCode.PROVIDER,
      message: 'Storage provider operation failed.',
    });
    const aborted = await rejectedStorageError(() =>
      driver.head('aborted.bin'),
    );
    expect(aborted).toMatchObject({
      aborted: true,
      cause: undefined,
      code: StorageErrorCode.ABORTED,
      message: 'Storage provider operation was aborted.',
      permanent: false,
      timedOut: false,
    });
    const timedOut = await rejectedStorageError(() =>
      driver.head('timeout.bin'),
    );
    expect(timedOut).toMatchObject({
      aborted: false,
      cause: undefined,
      code: StorageErrorCode.TIMEOUT,
      message: 'Storage provider operation timed out.',
      permanent: false,
      timedOut: true,
    });
    const nested = await rejectedStorageError(() => driver.head('nested.bin'));
    expect(nested).toMatchObject({
      cause: undefined,
      code: StorageErrorCode.UNAUTHORIZED,
      message: 'Storage provider operation was unauthorized.',
      permanent: true,
    });
    const flaggedNested = await rejectedStorageError(() =>
      driver.head('flagged-nested.bin'),
    );
    expect(flaggedNested).toMatchObject({
      aborted: true,
      cause: undefined,
      code: StorageErrorCode.TIMEOUT,
      message: 'Storage provider operation timed out.',
      permanent: false,
      timedOut: true,
    });
    const serialized = [
      unauthorized,
      provider,
      aborted,
      timedOut,
      nested,
      flaggedNested,
    ]
      .map(logShape)
      .join('\n');
    expect(serialized).not.toContain(unauthorizedDetail);
    expect(serialized).not.toContain(providerDetail);
    expect(serialized).not.toContain('secret aborted provider detail');
    expect(serialized).not.toContain('secret timeout provider detail');
    expect(serialized).not.toContain('secret nested storage detail');
    expect(serialized).not.toContain('secret nested request id');
    expect(serialized).not.toContain('secret flagged nested storage detail');
    expect(serialized).not.toContain('secret flagged nested request id');
  });

  it('preserves caller error classification without exposing its message or identity', async () => {
    const expected = new StorageError('stream limit reached', {
      code: StorageErrorCode.LIMIT_EXCEEDED,
      permanent: true,
    });
    const source = Readable.from(
      (async function* () {
        yield new Uint8Array([1]);
        throw expected;
      })(),
    );
    const driver = createFilesSdkDriver({ adapter: memory() });

    const error = await rejectedStorageError(() =>
      driver.upload('limited.bin', source, { multipart: true }),
    );
    expect(error).not.toBe(expected);
    expect(error).toMatchObject({
      cause: undefined,
      code: StorageErrorCode.LIMIT_EXCEEDED,
      message: 'Storage provider operation exceeded a limit.',
      permanent: true,
    });
    expect(logShape(error)).not.toContain('stream limit reached');
  });

  it('redacts direct StorageErrors and prefixed conditional adapter failures', async () => {
    const rawMessage = 'raw provider body secret-request-id';
    const ordinary = memory();
    ordinary.head = async () => {
      throw new StorageError(rawMessage, {
        cause: { requestId: 'ordinary-secret' },
        code: StorageErrorCode.PROVIDER,
      });
    };
    const ordinaryDriver = createFilesSdkDriver({ adapter: ordinary });
    const ordinaryError = await rejectedStorageError(() =>
      ordinaryDriver.head('ordinary.txt'),
    );
    expect(ordinaryError).toMatchObject({
      cause: undefined,
      code: StorageErrorCode.PROVIDER,
      key: undefined,
      message: 'Storage provider operation failed.',
    });
    expect(logShape(ordinaryError)).not.toContain(rawMessage);
    expect(logShape(ordinaryError)).not.toContain('ordinary-secret');

    const conditional = Object.assign(memory(), {
      conditionalRead: { etag: true, version: false },
      async downloadConditional(key: string): Promise<never> {
        throw new StorageError(`Storage object "${key}" was not found.`, {
          cause: { requestId: 'conditional-secret' },
          code: StorageErrorCode.NOT_FOUND,
          key,
          permanent: true,
        });
      },
    });
    const conditionalDriver = createFilesSdkDriver({
      adapter: conditional,
      prefix: 'secret-tenant-prefix',
    });
    const conditionalError = await rejectedStorageError(() =>
      conditionalDriver.downloadConditional('missing.txt', {
        condition: { etag: 'canonical-etag' },
      }),
    );
    expect(conditionalError).toMatchObject({
      cause: undefined,
      code: StorageErrorCode.NOT_FOUND,
      key: undefined,
      message: 'Storage provider object was not found.',
      permanent: true,
    });
    const serialized = logShape(conditionalError);
    expect(serialized).not.toContain('secret-tenant-prefix');
    expect(serialized).not.toContain('conditional-secret');
  });

  it('normalizes errors raised after a download stream is returned', async () => {
    const adapter = memory();
    adapter.download = async (key) =>
      createStoredFile(
        {
          key,
          size: 1,
          type: 'application/octet-stream',
        },
        {
          factory: () =>
            new ReadableStream<Uint8Array>({
              pull(controller) {
                controller.error(new Error('late provider failure'));
              },
            }),
          kind: 'stream',
        },
      );
    const driver = createFilesSdkDriver({ adapter });
    const object = await driver.download('late.bin');

    await expect(object.body.getReader().read()).rejects.toMatchObject({
      code: StorageErrorCode.PROVIDER,
      message: 'Storage provider operation failed.',
    });
  });

  it('normalizes one provider ETag and rejects ambiguous provider values', async () => {
    const adapter = memory();
    adapter.head = vi
      .fn()
      .mockResolvedValueOnce(
        createStoredFile(
          {
            etag: '"provider-etag"',
            key: 'safe.bin',
            size: 1,
            type: 'application/octet-stream',
          },
          {
            factory: () => new ReadableStream<Uint8Array>(),
            kind: 'stream',
          },
        ),
      )
      .mockResolvedValueOnce(
        createStoredFile(
          {
            etag: '"stale","current"',
            key: 'unsafe.bin',
            size: 1,
            type: 'application/octet-stream',
          },
          {
            factory: () => new ReadableStream<Uint8Array>(),
            kind: 'stream',
          },
        ),
      );
    const driver = createFilesSdkDriver({ adapter });

    await expect(driver.head('safe.bin')).resolves.toMatchObject({
      etag: 'provider-etag',
    });
    await expect(driver.head('unsafe.bin')).rejects.toMatchObject({
      code: StorageErrorCode.PROVIDER,
      permanent: true,
    });
  });

  it('rejects a conditional adapter result from the wrong physical key', async () => {
    const adapter = Object.assign(memory(), {
      conditionalCreate: { resultEtag: true },
      conditionalDelete: { etag: true },
      conditionalReplace: { resultEtag: true },
      deleteConditional: vi.fn(async () => undefined),
      uploadConditional: vi.fn(async () => ({
        contentType: 'text/plain',
        etag: 'etag',
        key: 'scope/other.txt',
        size: 4,
      })),
    });
    const driver = createFilesSdkDriver({ adapter, prefix: 'scope' });

    await expect(
      driver.uploadConditional('requested.txt', 'body', {
        condition: { type: 'create' },
      }),
    ).rejects.toMatchObject({
      code: StorageErrorCode.PROVIDER,
    });
    expect(adapter.uploadConditional).toHaveBeenCalledWith(
      'scope/requested.txt',
      'body',
      { condition: { type: 'create' } },
    );
  });

  it('validates an unprefixed physical-key budget against the exact adapter key before dispatch', async () => {
    const adapter = Object.assign(memory(), {
      physicalKey: { maxBytes: 1_024 },
    });
    const head = vi.spyOn(adapter, 'head');
    const driver = createFilesSdkDriver({ adapter });

    await expect(driver.head(`${'/'.repeat(1_024)}x`)).rejects.toMatchObject({
      code: StorageErrorCode.LIMIT_EXCEEDED,
      permanent: true,
    });
    expect(head).not.toHaveBeenCalled();
  });

  it.each([
    {
      expectedPhysicalKey: '//object.txt',
      logicalKey: '//object.txt',
      prefix: undefined,
    },
    {
      expectedPhysicalKey: 'scope/object.txt',
      logicalKey: '//object.txt',
      prefix: 'scope',
    },
  ])(
    'dispatches the same exact $expectedPhysicalKey to ordinary and conditional adapters',
    async ({ expectedPhysicalKey, logicalKey, prefix }) => {
      const head = vi.fn(async (key: string) =>
        createStoredFile(
          {
            key,
            size: 0,
            type: 'application/octet-stream',
          },
          {
            factory: () => new ReadableStream<Uint8Array>(),
            kind: 'stream',
          },
        ),
      );
      const downloadConditional = vi.fn(async (key: string) => ({
        body: new ReadableStream<Uint8Array>(),
        contentType: 'application/octet-stream',
        etag: 'current-etag',
        key,
        name: key.split('/').at(-1) ?? key,
        size: 0,
      }));
      const adapter = Object.assign(memory(), {
        conditionalRead: { etag: true, version: false },
        downloadConditional,
        head,
      });
      const driver = createFilesSdkDriver({
        adapter,
        ...(prefix !== undefined && { prefix }),
      });

      await driver.head(logicalKey);
      const object = await driver.downloadConditional(logicalKey, {
        condition: { etag: 'current-etag' },
      });
      await object.body.cancel();

      expect(head.mock.calls[0]?.[0]).toBe(expectedPhysicalKey);
      expect(downloadConditional.mock.calls[0]?.[0]).toBe(expectedPhysicalKey);
    },
  );

  it('rejects a configured list prefix plus its dispatch slash when over budget', async () => {
    const adapter = Object.assign(memory(), {
      physicalKey: { maxBytes: 1_024 },
    });
    const list = vi.spyOn(adapter, 'list');
    const driver = createFilesSdkDriver({
      adapter,
      prefix: 'x'.repeat(1_024),
    });

    await expect(driver.list()).rejects.toMatchObject({
      code: StorageErrorCode.LIMIT_EXCEEDED,
      permanent: true,
    });
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects an inferred scoped search prefix when even the safe walk is over budget', async () => {
    const adapter = Object.assign(memory(), {
      physicalKey: { maxBytes: 1_024 },
    });
    const list = vi.spyOn(adapter, 'list');
    const driver = createFilesSdkDriver({
      adapter,
      prefix: 'x'.repeat(1_024),
    });
    const collect = async (): Promise<void> => {
      for await (const _item of driver.search('child*')) {
        // Consume the lazy search so validation runs.
      }
    };

    await expect(collect()).rejects.toMatchObject({
      code: StorageErrorCode.LIMIT_EXCEEDED,
      permanent: true,
    });
    expect(list).not.toHaveBeenCalled();
  });

  it('rejects an over-budget inferred search prefix without widening the walk', async () => {
    const adapter = Object.assign(memory(), {
      physicalKey: { maxBytes: 2 },
    });
    const list = vi.spyOn(adapter, 'list');
    const driver = createFilesSdkDriver({ adapter });

    const collect = async (): Promise<void> => {
      for await (const _item of driver.search('foo/*.txt')) {
        // Consume the lazy search so its derived list operation is guarded.
      }
    };

    await expect(collect()).rejects.toMatchObject({
      code: StorageErrorCode.LIMIT_EXCEEDED,
      permanent: true,
    });
    expect(list).not.toHaveBeenCalled();
  });

  it.each([
    { pattern: '../secret*', prefix: undefined },
    { pattern: '/../secret*', prefix: undefined },
    { pattern: 'scope/../../x*', prefix: undefined },
    { pattern: '../secret*', prefix: 'tenant' },
    { pattern: '/../secret*', prefix: 'tenant' },
    { pattern: 'scope/../../x*', prefix: 'tenant' },
  ])(
    'rejects inferred relative search prefix $pattern with driver prefix $prefix',
    async ({ pattern, prefix }) => {
      const adapter = Object.assign(memory(), {
        physicalKey: { maxBytes: 1_024 },
      });
      const list = vi.spyOn(adapter, 'list');
      const driver = createFilesSdkDriver({
        adapter,
        ...(prefix !== undefined && { prefix }),
      });
      const collect = async (): Promise<void> => {
        for await (const _item of driver.search(pattern)) {
          // Consume the lazy search so validation runs.
        }
      };

      await expect(collect()).rejects.toMatchObject({
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
      });
      expect(list).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'tenant'])(
    'allows normal dotted inferred search prefixes with driver prefix %s',
    async (prefix) => {
      const adapter = memory();
      const list = vi.spyOn(adapter, 'list');
      const driver = createFilesSdkDriver({
        adapter,
        ...(prefix !== undefined && { prefix }),
      });

      for await (const _item of driver.search('.well-known/*.json')) {
        // The empty memory adapter has no results.
      }

      expect(list).toHaveBeenCalled();
    },
  );

  it('uses the exact picomatch-inferred base for physical-key budgeting', async () => {
    const adapter = Object.assign(memory(), {
      physicalKey: { maxBytes: 5 },
    });
    const list = vi.spyOn(adapter, 'list');
    const driver = createFilesSdkDriver({ adapter, prefix: 't' });

    for await (const _item of driver.search('foo/*.txt')) {
      // The empty memory adapter has no results.
    }

    expect(list).toHaveBeenCalledOnce();
    expect(list.mock.calls[0]?.[0]?.prefix).toBe('t/foo');
  });

  it('does not validate or dispatch a search walk when maxResults is non-positive', async () => {
    const adapter = Object.assign(memory(), {
      physicalKey: { maxBytes: 1_024 },
    });
    const list = vi.spyOn(adapter, 'list');
    const driver = createFilesSdkDriver({
      adapter,
      prefix: 'x'.repeat(1_024),
    });

    for await (const _item of driver.search('child*', { maxResults: 0 })) {
      // files-sdk returns before walking the provider.
    }

    expect(list).not.toHaveBeenCalled();
  });

  it('enforces key budgets after plugins rewrite object and list operations', async () => {
    const adapter = Object.assign(memory(), {
      physicalKey: { maxBytes: 1_024 },
    });
    const upload = vi.spyOn(adapter, 'upload');
    const list = vi.spyOn(adapter, 'list');
    const overBudget = 'x'.repeat(1_025);
    const driver = createFilesSdkDriver({
      adapter,
      plugins: [
        {
          name: 'malicious-key-rewriter',
          wrap: handlers({
            list: (operation, next) =>
              next({
                ...operation,
                options: { ...operation.options, prefix: overBudget },
              }),
            upload: (operation, next) =>
              next({ ...operation, key: overBudget }),
          }),
        },
      ],
    });

    await expect(driver.upload('ok', 'body')).rejects.toMatchObject({
      code: StorageErrorCode.LIMIT_EXCEEDED,
      permanent: true,
    });
    await expect(driver.list()).rejects.toMatchObject({
      code: StorageErrorCode.LIMIT_EXCEEDED,
      permanent: true,
    });
    const collect = async (): Promise<void> => {
      for await (const _item of driver.search('ok*')) {
        // Consume the lazy search so the rewritten list reaches dispatch.
      }
    };
    await expect(collect()).rejects.toMatchObject({
      code: StorageErrorCode.LIMIT_EXCEEDED,
      permanent: true,
    });

    expect(upload).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

  it('keeps ordinary uploads in the Files plugin pipeline and fails conditional uploads closed', async () => {
    const adapter = Object.assign(memory(), {
      conditionalCreate: { resultEtag: true },
      uploadConditional: vi.fn(async (key: string) => ({
        contentType: 'text/plain',
        etag: 'conditional-etag',
        key,
        size: 10,
      })),
    });
    const upload = vi.spyOn(adapter, 'upload');
    const transform = vi.fn();
    const driver = createFilesSdkDriver({
      adapter,
      plugins: [
        {
          name: 'body-transform',
          wrap: handlers({
            upload: (operation, next) => {
              transform(operation.body);
              return next({ ...operation, body: 'ciphertext' });
            },
          }),
        },
      ],
    });

    expect(driver.capabilities.conditionalCreate).toBeUndefined();
    await expect(driver.upload('ordinary.txt', 'plaintext')).resolves.toEqual(
      expect.objectContaining({ key: 'ordinary.txt' }),
    );
    expect(transform).toHaveBeenCalledOnce();
    expect(transform).toHaveBeenCalledWith('plaintext');
    expect(upload.mock.calls[0]?.[1]).toBe('ciphertext');

    await expect(
      driver.uploadConditional('conditional.txt', 'plaintext', {
        condition: { type: 'create' },
      }),
    ).rejects.toMatchObject({
      code: StorageErrorCode.NOT_SUPPORTED,
      permanent: true,
    });
    expect(transform).toHaveBeenCalledOnce();
    expect(adapter.uploadConditional).not.toHaveBeenCalled();
  });

  it.each([
    {
      filesPolicy: {
        plugins: [{ name: 'no-op', wrap: handlers({}) }],
      },
      policyName: 'a nonempty plugin list',
    },
    {
      filesPolicy: { hooks: { onAction: vi.fn() } },
      policyName: 'an active action hook',
    },
    {
      filesPolicy: { hooks: { onError: vi.fn() } },
      policyName: 'an active error hook',
    },
    {
      filesPolicy: { hooks: { onRetry: vi.fn() } },
      policyName: 'an active retry hook',
    },
    {
      filesPolicy: { receipts: true },
      policyName: 'receipts',
    },
    {
      filesPolicy: { receipts: { sha256: false } },
      policyName: 'receipt options',
    },
  ])(
    'hides and blocks every conditional operation with $policyName',
    async ({ filesPolicy }) => {
      const adapter = Object.assign(memory(), {
        conditionalCopyDestination: {
          atomicWithSource: true,
          create: true,
          replace: true,
        },
        conditionalCopySource: { etag: true, version: true },
        conditionalCreate: { resultEtag: true },
        conditionalDelete: { etag: true },
        conditionalMultipartCompletion: { create: true, replace: true },
        conditionalRead: { etag: true, version: true },
        conditionalReplace: { resultEtag: true },
        deleteConditional: vi.fn(),
        downloadConditional: vi.fn(),
        promote: vi.fn(),
        uploadConditional: vi.fn(),
      });
      const driver = createFilesSdkDriver({ adapter, ...filesPolicy });

      expect(driver.capabilities.conditionalCopyDestination).toBeUndefined();
      expect(driver.capabilities.conditionalCopySource).toBeUndefined();
      expect(driver.capabilities.conditionalCreate).toBeUndefined();
      expect(driver.capabilities.conditionalDelete).toBeUndefined();
      expect(
        driver.capabilities.conditionalMultipartCompletion,
      ).toBeUndefined();
      expect(driver.capabilities.conditionalRead).toBeUndefined();
      expect(driver.capabilities.conditionalReplace).toBeUndefined();

      await expect(
        driver.uploadConditional('create.txt', 'plaintext', {
          condition: { type: 'create' },
        }),
      ).rejects.toMatchObject({
        code: StorageErrorCode.NOT_SUPPORTED,
        permanent: true,
      });
      await expect(
        driver.downloadConditional('read.txt', {
          condition: { etag: 'current-etag' },
        }),
      ).rejects.toMatchObject({
        code: StorageErrorCode.NOT_SUPPORTED,
        permanent: true,
      });
      await expect(
        driver.deleteConditional('delete.txt', {
          condition: { etag: 'current-etag' },
        }),
      ).rejects.toMatchObject({
        code: StorageErrorCode.NOT_SUPPORTED,
        permanent: true,
      });
      await expect(
        driver.promote('source.txt', 'destination.txt', {
          destination: { type: 'create' },
          sourceEtag: 'source-etag',
        }),
      ).rejects.toMatchObject({
        code: StorageErrorCode.NOT_SUPPORTED,
        permanent: true,
      });

      expect(adapter.uploadConditional).not.toHaveBeenCalled();
      expect(adapter.downloadConditional).not.toHaveBeenCalled();
      expect(adapter.deleteConditional).not.toHaveBeenCalled();
      expect(adapter.promote).not.toHaveBeenCalled();
    },
  );

  it('keeps conditional operations compatible with explicitly inactive Files options', async () => {
    const adapter = Object.assign(memory(), {
      conditionalCreate: { resultEtag: true },
      uploadConditional: vi.fn(async (key: string) => ({
        contentType: 'text/plain',
        etag: 'conditional-etag',
        key,
        size: 4,
      })),
    });
    const driver = createFilesSdkDriver({
      adapter,
      hooks: {},
      plugins: [],
      receipts: false,
    });

    expect(driver.capabilities.conditionalCreate).toEqual({
      resultEtag: true,
    });
    await expect(
      driver.uploadConditional('conditional.txt', 'body', {
        condition: { type: 'create' },
      }),
    ).resolves.toMatchObject({ key: 'conditional.txt' });
    expect(adapter.uploadConditional).toHaveBeenCalledOnce();
  });

  it('snapshots an inactive hooks object before deciding conditional compatibility', async () => {
    const adapter = Object.assign(memory(), {
      conditionalCreate: { resultEtag: true },
      uploadConditional: vi.fn(async (key: string) => ({
        contentType: 'text/plain',
        etag: 'conditional-etag',
        key,
        size: 4,
      })),
    });
    const hooks: FilesHooks = {};
    const driver = createFilesSdkDriver({ adapter, hooks });
    const onAction = vi.fn();
    hooks.onAction = onAction;

    await expect(driver.upload('ordinary.txt', 'body')).resolves.toMatchObject({
      key: 'ordinary.txt',
    });
    await expect(
      driver.uploadConditional('conditional.txt', 'body', {
        condition: { type: 'create' },
      }),
    ).resolves.toMatchObject({ key: 'conditional.txt' });

    expect(onAction).not.toHaveBeenCalled();
    expect(adapter.uploadConditional).toHaveBeenCalledOnce();
  });

  it('rejects a raw undecorated s3 adapter before dispatch', () => {
    const adapter = s3BackedMemoryAdapter();
    const upload = vi.spyOn(adapter, 'upload');

    expect(() => createFilesSdkDriver({ adapter, readonly: true })).toThrow(
      expect.objectContaining({
        code: StorageErrorCode.INVALID_ARGUMENT,
        permanent: true,
      }),
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects a renamed package S3 adapter through a raw proxy before dispatch', () => {
    const adapter = s3BackedMemoryAdapter();
    const upload = vi.spyOn(adapter, 'upload');
    markFilesSdkS3AdapterUndecorated(adapter);
    const alias = {
      ...adapter,
      name: 'renamed-s3',
      raw: new Proxy(adapter.raw, {}),
    };

    expect(() => createFilesSdkDriver({ adapter: alias })).toThrow(
      expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it.each(['undecorated', 'unverified'] as const)(
    'rejects a shallow %s S3 alias that replaces raw but keeps package methods',
    (state) => {
      const adapter = s3BackedMemoryAdapter();
      const upload = vi.spyOn(adapter, 'upload');
      if (state === 'undecorated') {
        markFilesSdkS3AdapterUndecorated(adapter);
      } else {
        markFilesSdkS3AdapterProvenance(adapter, 'unverified');
      }
      const alias = {
        ...adapter,
        name: `renamed-${adapter.name}`,
        raw: {},
      };

      expect(() => createFilesSdkDriver({ adapter: alias })).toThrow(
        expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
      );
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it('enforces unverified S3 provenance before ordinary mutation dispatch', async () => {
    const adapter = s3BackedMemoryAdapter();
    const upload = vi.spyOn(adapter, 'upload');
    const remove = vi.spyOn(adapter, 'delete');
    const copy = vi.spyOn(adapter, 'copy');
    const move = vi.spyOn(adapter, 'move');
    const signedUploadUrl = vi.spyOn(adapter, 'signedUploadUrl');
    markFilesSdkS3AdapterProvenance(adapter, 'unverified');
    const alias = { ...adapter, name: `renamed-${adapter.name}` };

    const driver = createFilesSdkDriver({ adapter: alias, readonly: false });

    expect(driver.capabilities).toMatchObject({
      nativeUploadProgress: false,
      resumableUpload: false,
      serverSideCopy: false,
      signedUpload: false,
    });
    await expect(driver.upload('upload.txt', 'body')).rejects.toMatchObject({
      code: StorageErrorCode.READ_ONLY,
    });
    await expect(driver.delete('delete.txt')).rejects.toMatchObject({
      code: StorageErrorCode.READ_ONLY,
    });
    await expect(driver.copy('source.txt', 'copy.txt')).rejects.toMatchObject({
      code: StorageErrorCode.READ_ONLY,
    });
    await expect(driver.move('source.txt', 'move.txt')).rejects.toMatchObject({
      code: StorageErrorCode.READ_ONLY,
    });
    await expect(
      driver.signUpload('signed.txt', { expiresIn: 60 }),
    ).rejects.toMatchObject({ code: StorageErrorCode.READ_ONLY });

    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(signedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects forged global S3 provenance from a foreign package copy', () => {
    const adapter = s3BackedMemoryAdapter('renamed-s3');
    const upload = vi.spyOn(adapter, 'upload');
    Object.defineProperty(
      adapter.raw,
      Symbol.for('@concepta/rockets-storage/files-sdk/s3-adapter-provenance'),
      {
        configurable: false,
        enumerable: false,
        value: 'verified',
        writable: false,
      },
    );

    expect(() => createFilesSdkDriver({ adapter })).toThrow(
      expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects a Proxy that forges symbol-description provenance', () => {
    const adapter = s3BackedMemoryAdapter();
    const upload = vi.spyOn(adapter, 'upload');
    const forged = new Proxy(adapter, {
      get(target, property, receiver) {
        if (typeof property === 'symbol') {
          return {
            provenance: 'verified',
            surface: {},
          };
        }
        return Reflect.get(target, property, receiver);
      },
    });

    expect(() => createFilesSdkDriver({ adapter: forged })).toThrow(
      expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it.each(['native', 'verified'] as const)(
    'permits mutations through aliases for %s S3 provenance',
    async (provenance) => {
      const adapter = Object.assign(s3BackedMemoryAdapter(), {
        physicalKey: Object.freeze({ maxBytes: 1_024 }),
      });
      const upload = vi.spyOn(adapter, 'upload');
      markFilesSdkS3AdapterUndecorated(adapter);
      markFilesSdkS3AdapterProvenance(adapter, provenance);
      const alias = new Proxy(
        {
          ...adapter,
          name: `renamed-${adapter.name}`,
        },
        {},
      );
      const driver = createFilesSdkDriver({ adapter: alias });

      await expect(driver.upload('allowed.txt', 'body')).resolves.toMatchObject(
        { key: 'allowed.txt' },
      );
      expect(upload).toHaveBeenCalledOnce();
    },
  );

  it('keeps an existing explicit readonly driver readonly after its raw client is verified', async () => {
    const adapter = s3BackedMemoryAdapter('s3-alias');
    markFilesSdkS3AdapterProvenance(adapter, 'verified');
    const blocked = createFilesSdkDriver({ adapter, readonly: true });
    const allowed = createFilesSdkDriver({ adapter });

    await expect(blocked.upload('blocked.txt', 'body')).rejects.toMatchObject({
      code: StorageErrorCode.READ_ONLY,
    });
    await expect(allowed.upload('allowed.txt', 'body')).resolves.toMatchObject({
      key: 'allowed.txt',
    });
  });

  it('rejects same-raw aliases that add or replace reserved S3 extensions', () => {
    const physicalKey = Object.freeze({ maxBytes: 1_024 });
    const adapter = Object.assign(s3BackedMemoryAdapter(), { physicalKey });
    markFilesSdkS3AdapterProvenance(adapter, 'verified');

    expect(() =>
      createFilesSdkDriver({
        adapter: {
          ...adapter,
          conditionalCreate: { resultEtag: true },
        },
      }),
    ).toThrow(
      expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
    );
    expect(() =>
      createFilesSdkDriver({
        adapter: {
          ...adapter,
          physicalKey: { maxBytes: 1_024 },
        },
      }),
    ).toThrow(
      expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
    );
  });

  it.each([
    'url',
    'signedUploadUrl',
    'upload',
    'delete',
    'copy',
    'move',
  ] as const)('rejects a same-raw alias that replaces %s', (method) => {
    const adapter = s3BackedMemoryAdapter();
    markFilesSdkS3AdapterProvenance(adapter, 'verified');
    const alias = { ...adapter } as unknown as Record<string, unknown>;
    alias[method] = vi.fn();

    expect(() =>
      createFilesSdkDriver({
        adapter: alias as unknown as typeof adapter,
      }),
    ).toThrow(
      expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
    );
  });

  it('rejects same-raw aliases that replace bucket or support authority', () => {
    const adapter = s3BackedMemoryAdapter();
    markFilesSdkS3AdapterProvenance(adapter, 'verified');

    expect(() =>
      createFilesSdkDriver({
        adapter: { ...adapter, bucket: 'other-bucket' },
      }),
    ).toThrow(
      expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
    );
    expect(() =>
      createFilesSdkDriver({
        adapter: {
          ...adapter,
          supportsRange: adapter.supportsRange !== true,
        },
      }),
    ).toThrow(
      expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
    );
  });

  it('binds a validated adapter snapshot before Files retains it', async () => {
    const adapter = s3BackedMemoryAdapter();
    const originalUpload = vi.fn(adapter.upload);
    adapter.upload = originalUpload;
    markFilesSdkS3AdapterProvenance(adapter, 'verified');
    const alias = { ...adapter };

    const driver = createFilesSdkDriver({ adapter: alias });
    const replacementUpload = vi.fn(async () => {
      throw new Error('replacement upload must not be retained');
    });
    alias.upload = replacementUpload;

    await driver.upload('bound.txt', 'body');

    expect(originalUpload).toHaveBeenCalledOnce();
    expect(replacementUpload).not.toHaveBeenCalled();
  });

  it('does not transfer verified provenance to a different raw client', () => {
    const adapter = s3BackedMemoryAdapter();
    const upload = vi.spyOn(adapter, 'upload');
    markFilesSdkS3AdapterProvenance(adapter, 'verified');
    const differentRaw = {
      config: { serviceId: 'S3' },
      send: vi.fn(),
    };
    const alias = new Proxy(adapter, {
      get(target, property, receiver) {
        return property === 'raw'
          ? differentRaw
          : Reflect.get(target, property, receiver);
      },
    });
    expect(() => createFilesSdkDriver({ adapter: alias })).toThrow(
      expect.objectContaining({ code: StorageErrorCode.INVALID_ARGUMENT }),
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('keeps generic non-S3 adapters writable', async () => {
    const adapter = memory();
    const upload = vi.spyOn(adapter, 'upload');
    const driver = createFilesSdkDriver({ adapter });

    await expect(driver.upload('allowed.txt', 'body')).resolves.toMatchObject({
      key: 'allowed.txt',
    });
    expect(upload).toHaveBeenCalledOnce();
  });

  it('hides and blocks every conditional mutation for unverified S3 provenance', async () => {
    const uploadConditional = vi.fn();
    const deleteConditional = vi.fn();
    const promote = vi.fn();
    const adapter = Object.assign(s3BackedMemoryAdapter(), {
      conditionalCopyDestination: {
        atomicWithSource: true,
        create: true,
        replace: true,
      },
      conditionalCopySource: { etag: true, version: true },
      conditionalCreate: { resultEtag: true },
      conditionalDelete: { etag: true },
      conditionalMultipartCompletion: { create: true, replace: true },
      conditionalReplace: { resultEtag: true },
      deleteConditional,
      promote,
      uploadConditional,
    });
    markFilesSdkS3AdapterProvenance(adapter, 'unverified');
    const driver = createFilesSdkDriver({ adapter });

    expect(driver.capabilities.conditionalCreate).toBeUndefined();
    expect(driver.capabilities.conditionalReplace).toBeUndefined();
    expect(driver.capabilities.conditionalDelete).toBeUndefined();
    expect(driver.capabilities.conditionalCopySource).toBeUndefined();
    expect(driver.capabilities.conditionalCopyDestination).toBeUndefined();
    expect(driver.capabilities.conditionalMultipartCompletion).toBeUndefined();
    for (const multipart of [false, true]) {
      await expect(
        driver.uploadConditional('create.txt', 'body', {
          condition: { type: 'create' },
          multipart,
        }),
      ).rejects.toMatchObject({ code: StorageErrorCode.READ_ONLY });
      await expect(
        driver.uploadConditional('replace.txt', 'body', {
          condition: { etag: 'current-etag', type: 'replace' },
          multipart,
        }),
      ).rejects.toMatchObject({ code: StorageErrorCode.READ_ONLY });
    }
    await expect(
      driver.deleteConditional('delete.txt', {
        condition: { etag: 'current-etag' },
      }),
    ).rejects.toMatchObject({ code: StorageErrorCode.READ_ONLY });
    await expect(
      driver.promote('source.txt', 'destination.txt', {
        destination: { type: 'create' },
        sourceEtag: 'source-etag',
      }),
    ).rejects.toMatchObject({ code: StorageErrorCode.READ_ONLY });

    expect(uploadConditional).not.toHaveBeenCalled();
    expect(deleteConditional).not.toHaveBeenCalled();
    expect(promote).not.toHaveBeenCalled();
  });
});
