import { deepStrictEqual, equal, fail, match, ok } from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { inspect } from 'node:util';

import type { StorageClient } from '../storage.client.js';
import { isCanonicalStorageEtag } from '../storage-etag.js';
import {
  isStorageError,
  StorageErrorCode,
  type StorageError,
} from '../storage.error.js';
import type {
  StorageCapabilities,
  StorageConditionalCopyDestinationCapability,
  StorageConditionalCopySourceCapability,
  StorageConditionalDeleteCapability,
  StorageConditionalMultipartCompletionCapability,
  StorageConditionalReadCapability,
  StorageConditionalWriteCapability,
  StorageObject,
  StorageListResult,
  StoragePhysicalKeyCapability,
  StorageSignedUploadPolicyCapability,
  StorageUploadResult,
} from '../storage.types.js';

const CONDITIONAL_CAPABILITY_KEYS = [
  'conditionalCreate',
  'conditionalReplace',
  'conditionalDelete',
  'conditionalRead',
  'conditionalCopySource',
  'conditionalCopyDestination',
  'conditionalMultipartCompletion',
] as const;
const DEFAULT_MULTIPART_BYTES = 5 * 1024 * 1024 + 1;
const PASSED = Object.freeze({ status: 'passed' as const });

export interface StorageProviderConformanceCapabilities {
  readonly conditionalCreate?: StorageConditionalWriteCapability;
  readonly conditionalReplace?: StorageConditionalWriteCapability;
  readonly conditionalDelete?: StorageConditionalDeleteCapability;
  readonly conditionalRead?: StorageConditionalReadCapability;
  readonly conditionalCopySource?: StorageConditionalCopySourceCapability;
  readonly conditionalCopyDestination?: StorageConditionalCopyDestinationCapability;
  readonly conditionalMultipartCompletion?: StorageConditionalMultipartCompletionCapability;
  readonly physicalKey: StoragePhysicalKeyCapability;
  readonly signedUploadPolicy?: StorageSignedUploadPolicyCapability;
}

export interface StorageProviderConformanceFixture {
  readonly client: StorageClient;
  /**
   * Builds a new client and driver for the same logical store and backend
   * configuration. The harness owns the returned client and shuts it down.
   */
  readonly createReplica: () => StorageClient | Promise<StorageClient>;
  /**
   * Returns the number of operations dispatched to the provider driver. When
   * supplied, the contract proves invalid inputs fail before provider I/O.
   */
  readonly dispatchCount?: () => number;
  /**
   * Resolves the current immutable version for a logical key. Providers that
   * advertise version predicates should supply this for a version-enabled
   * test bucket. Returning undefined visibly skips only the version subcases.
   */
  readonly resolveVersion?: (key: string) => Promise<string | undefined>;
  /**
   * Optional provider-aware cleanup. This is useful for versioned buckets,
   * where a plain delete would leave historical object versions behind.
   */
  readonly cleanup?: (keys: readonly string[]) => void | Promise<void>;
  readonly close?: () => void | Promise<void>;
}

export interface StorageProviderConformanceOptions {
  readonly createFixture:
    | (() => StorageProviderConformanceFixture)
    | (() => Promise<StorageProviderConformanceFixture>);
  readonly expected: StorageProviderConformanceCapabilities;
  /** Values such as test credentials that must never occur in public errors. */
  readonly forbiddenErrorValues?: readonly string[];
  readonly multipartBytes?: number;
  readonly provider: string;
}

export type StorageProviderConformanceCaseResult =
  | typeof PASSED
  | { readonly reason: string; readonly status: 'skipped' };

export interface StorageProviderConformanceCase {
  readonly name: string;
  run(): Promise<StorageProviderConformanceCaseResult>;
}

interface CaseContext {
  readonly client: StorageClient;
  readonly dispatchCount?: () => number;
  createReplica(): Promise<StorageClient>;
  key(label: string): string;
  resolveVersion(key: string): Promise<string | undefined>;
  track(key: string): string;
}

type CaseOperation = (
  context: CaseContext,
) =>
  | StorageProviderConformanceCaseResult
  | Promise<StorageProviderConformanceCaseResult | void>
  | void;

/**
 * Builds runner-agnostic provider contract cases. A test runner can register
 * each returned case independently and translate a `skipped` result into its
 * native skip primitive. Every case receives a fresh client and namespace.
 */
export function createStorageProviderConformanceCases(
  options: StorageProviderConformanceOptions,
): readonly StorageProviderConformanceCase[] {
  positiveSafeInteger(
    options.expected.physicalKey.maxBytes,
    'expected.physicalKey.maxBytes',
  );
  positiveSafeInteger(
    options.multipartBytes ?? DEFAULT_MULTIPART_BYTES,
    'multipartBytes',
  );
  ok(options.provider.trim().length > 0, 'provider must not be empty');

  const expected = options.expected;
  return Object.freeze([
    providerCase(
      options,
      'declares the exact provider capability matrix',
      ({ client }) => {
        deepStrictEqual(
          conditionalCapabilitiesOf(client.capabilities),
          expected,
          `${options.provider} advertised a capability matrix different from its verified profile`,
        );
      },
    ),
    providerCase(
      options,
      'performs baseline upload, read, and delete operations',
      async (context) => {
        const key = context.key('baseline.txt');
        await seed(context, key, 'baseline');
        assertOptionalResultEtag(
          await context.client.head(key),
          'provider head returned a non-canonical ETag',
        );
        equal(await readText(context.client, key), 'baseline');
        await context.client.delete(key);
        equal(await context.client.exists(key), false);
      },
    ),
    listCursorReplayCase(options),
    providerCase(
      options,
      'rejects an over-budget physical key before dispatch',
      async ({ client }) => {
        const key = 'x'.repeat(expected.physicalKey.maxBytes + 1);
        const error = await expectStorageError(
          () => client.upload(key, 'must-not-dispatch'),
          StorageErrorCode.LIMIT_EXCEEDED,
          options,
        );
        equal(error.permanent, true);
      },
    ),
    invalidPreconditionEtagCase(options),
    conditionalCreateCase(options),
    conditionalReplaceCase(options),
    conditionalDeleteCase(options),
    conditionalReadEtagCase(options),
    conditionalReadVersionCase(options),
    conditionalCopySourceEtagCase(options),
    conditionalCopySourceVersionCase(options),
    conditionalCopyDestinationCreateCase(options),
    conditionalCopyDestinationReplaceCase(options),
    ...conditionalCopyAtomicityCases(options),
    conditionalMultipartCreateCase(options),
    conditionalMultipartReplaceCase(options),
    providerCase(
      options,
      'sanitizes a provider not-found response',
      async (context) => {
        await expectStorageError(
          () => context.client.head(context.key('missing.txt')),
          StorageErrorCode.NOT_FOUND,
          options,
        );
      },
    ),
  ]);
}

function listCursorReplayCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  return providerCase(
    options,
    'replays portable list cursors after descendants and limit changes',
    async (context) => {
      await verifyCursorReplay(context, 'cursor-replay-flat', [
        '01.txt',
        '02.txt',
        '03.txt',
        '04.txt',
        '05.txt',
      ]);
      if (context.client.capabilities.delimiter) {
        await verifyCursorReplay(
          context,
          'cursor-replay-delimited',
          [
            '01.txt',
            '02-dir/inside.txt',
            '03.txt',
            '04-dir/inside.txt',
            '05.txt',
          ],
          '/',
        );
      }
    },
  );
}

async function verifyCursorReplay(
  context: CaseContext,
  label: string,
  names: readonly [string, string, string, string, string],
  delimiter?: string,
): Promise<void> {
  const [firstName, ...remainingNames] = names;
  const firstKey = context.key(`${label}/${firstName}`);
  const prefix = firstKey.slice(0, -firstName.length);
  await seed(context, firstKey, firstName);
  for (const name of remainingNames) {
    await seed(context, context.track(`${prefix}${name}`), name);
  }

  const request: CursorReplayRequest = {
    ...(delimiter === undefined ? {} : { delimiter }),
    limit: 1,
    prefix,
  };
  const first = await context.client.list(request);
  assertPageSize(first, 1);
  const cursor = requiredCursor(
    first,
    'provider omitted a continuation cursor while matching entries remained',
  );

  const replayRequest = { ...request, cursor };
  const expected = await context.client.list(replayRequest);
  assertPageSize(expected, 1);
  const descendantCursor = requiredCursor(
    expected,
    'provider omitted a descendant cursor while matching entries remained',
  );

  // Follow a cursor derived from the input before replaying its ancestor. A
  // consuming cursor implementation will now fail or change the page.
  const descendant = await context.client.list({
    ...request,
    cursor: descendantCursor,
  });
  assertPageSize(descendant, 1);
  const replayed = await context.client.list(replayRequest);
  assertEquivalentListPage(
    replayed,
    expected,
    'reusing a provider cursor after its descendant changed the page',
  );
  await assertEquivalentNextPage(
    context.client,
    replayed,
    descendant,
    request,
    'replayed cursor returned a continuation for a different position',
  );

  const wider = await context.client.list({
    ...replayRequest,
    limit: 2,
  });
  assertPageSize(wider, 2);
  deepStrictEqual(
    logicalEntryIds(wider),
    [...logicalEntryIds(expected), ...logicalEntryIds(descendant)].sort(),
    'changing the page limit changed the cursor starting position',
  );
  const afterWider = await context.client.list({
    ...request,
    cursor: requiredCursor(
      descendant,
      'provider ended before the wider-page continuation could be verified',
    ),
  });
  await assertEquivalentNextPage(
    context.client,
    wider,
    afterWider,
    request,
    'changed-limit cursor returned a continuation for a different position',
  );

  const replica = await context.createReplica();
  const replicaReplay = await replica.list(replayRequest);
  assertEquivalentListPage(
    replicaReplay,
    expected,
    'an independently constructed replica resumed at a different page',
  );
  await assertEquivalentNextPage(
    replica,
    replicaReplay,
    descendant,
    request,
    'replica cursor returned a continuation for a different position',
  );

  const replicaWider = await replica.list({ ...replayRequest, limit: 2 });
  assertEquivalentListPage(
    replicaWider,
    wider,
    'a replica changed the page returned with a different limit',
  );
  await assertEquivalentNextPage(
    replica,
    replicaWider,
    afterWider,
    request,
    'replica changed-limit cursor returned a continuation for a different position',
  );
}

interface CursorReplayRequest {
  readonly delimiter?: string;
  readonly limit: number;
  readonly prefix: string;
}

function comparableListPage(page: StorageListResult): unknown {
  return {
    items: page.items.map((item) => ({
      contentType: item.contentType,
      etag: item.etag,
      key: item.key,
      lastModified: item.lastModified?.toISOString(),
      metadata: item.metadata,
      name: item.name,
      size: item.size,
    })),
    prefixes: page.prefixes,
  };
}

function assertEquivalentListPage(
  actual: StorageListResult,
  expected: StorageListResult,
  message: string,
): void {
  deepStrictEqual(
    comparableListPage(actual),
    comparableListPage(expected),
    message,
  );
  equal(
    actual.cursor === undefined,
    expected.cursor === undefined,
    `${message}: continuation presence differed`,
  );
}

async function assertEquivalentNextPage(
  client: StorageClient,
  actual: StorageListResult,
  expectedNext: StorageListResult,
  request: CursorReplayRequest,
  message: string,
): Promise<void> {
  const cursor = requiredCursor(
    actual,
    `${message}: provider did not return a continuation cursor`,
  );
  const actualNext = await client.list({ ...request, cursor });
  assertEquivalentListPage(actualNext, expectedNext, message);
}

function assertPageSize(page: StorageListResult, expected: number): void {
  equal(
    page.items.length + (page.prefixes?.length ?? 0),
    expected,
    'provider ignored the list page limit across items and common prefixes',
  );
}

function requiredCursor(page: StorageListResult, message: string): string {
  ok(page.cursor !== undefined && page.cursor.length > 0, message);
  return page.cursor;
}

function logicalEntryIds(page: StorageListResult): string[] {
  return [
    ...page.items.map((item) => `item:${item.key}`),
    ...(page.prefixes ?? []).map((prefix) => `prefix:${prefix}`),
  ].sort();
}

function invalidPreconditionEtagCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  return providerCase(
    options,
    'rejects invalid conditional ETags before dispatch or mutation',
    async (context) => {
      const source = context.key('invalid-etag-source.txt');
      const destination = context.key('invalid-etag-destination.txt');
      await seed(context, source, 'source-original');
      await seed(context, destination, 'destination-original');

      const countDispatches = context.dispatchCount;
      const dispatchedBefore = countDispatches?.();
      const invalidEtag = '"stale","current"';
      const operations = [
        () =>
          context.client.uploadConditional(source, 'must-not-replace', {
            condition: { etag: invalidEtag, type: 'replace' },
          }),
        () =>
          context.client.downloadConditional(source, {
            condition: { etag: invalidEtag },
          }),
        () =>
          context.client.deleteConditional(source, {
            condition: { etag: invalidEtag },
          }),
        () =>
          context.client.promote(source, destination, {
            sourceEtag: invalidEtag,
          }),
        () =>
          context.client.promote(source, destination, {
            destination: { etag: invalidEtag, type: 'replace' },
          }),
      ] as const;

      for (const operation of operations) {
        const error = await expectStorageError(
          operation,
          StorageErrorCode.INVALID_ARGUMENT,
          options,
        );
        equal(error.permanent, true);
      }

      if (countDispatches !== undefined && dispatchedBefore !== undefined) {
        equal(
          countDispatches(),
          dispatchedBefore,
          'invalid conditional ETags reached the provider driver',
        );
      }
      equal(await readText(context.client, source), 'source-original');
      equal(
        await readText(context.client, destination),
        'destination-original',
      );
    },
  );
}

function conditionalCreateCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const capability = options.expected.conditionalCreate;
  return providerCase(
    options,
    capability === undefined
      ? 'fails closed when conditional create is unsupported'
      : 'enforces conditional create atomically',
    async (context) => {
      const key = context.key('conditional-create.txt');
      if (capability === undefined) {
        await expectStorageError(
          () =>
            context.client.uploadConditional(key, 'blocked', {
              condition: { type: 'create' },
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        equal(await context.client.exists(key), false);
        return;
      }

      const created = await context.client.uploadConditional(key, 'created', {
        condition: { type: 'create' },
      });
      assertResultEtag(created, capability.resultEtag);
      await expectStorageError(
        () =>
          context.client.uploadConditional(key, 'overwritten', {
            condition: { type: 'create' },
          }),
        StorageErrorCode.CONFLICT,
        options,
      );
      equal(await readText(context.client, key), 'created');
    },
  );
}

function conditionalReplaceCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const capability = options.expected.conditionalReplace;
  return providerCase(
    options,
    capability === undefined
      ? 'fails closed when conditional replace is unsupported'
      : 'enforces conditional replace atomically',
    async (context) => {
      const key = context.key('conditional-replace.txt');
      const original = await seed(context, key, 'original');
      const etag = await resultEtag(context.client, key, original);
      if (capability === undefined) {
        await expectStorageError(
          () =>
            context.client.uploadConditional(key, 'blocked', {
              condition: { etag, type: 'replace' },
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        equal(await readText(context.client, key), 'original');
        return;
      }

      const replaced = await context.client.uploadConditional(key, 'replaced', {
        condition: { etag, type: 'replace' },
      });
      assertResultEtag(replaced, capability.resultEtag);
      await expectStorageError(
        () =>
          context.client.uploadConditional(key, 'stale-overwrite', {
            condition: { etag, type: 'replace' },
          }),
        StorageErrorCode.CONFLICT,
        options,
      );
      equal(await readText(context.client, key), 'replaced');
    },
  );
}

function conditionalDeleteCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const capability = options.expected.conditionalDelete;
  return providerCase(
    options,
    capability?.etag === true
      ? 'enforces ETag-conditional delete atomically'
      : 'fails closed when ETag-conditional delete is unsupported',
    async (context) => {
      const key = context.key('conditional-delete.txt');
      const original = await seed(context, key, 'retained');
      const etag = await resultEtag(context.client, key, original);
      if (capability?.etag !== true) {
        await expectStorageError(
          () =>
            context.client.deleteConditional(key, {
              condition: { etag },
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        equal(await context.client.exists(key), true);
        return;
      }

      await expectStorageError(
        () =>
          context.client.deleteConditional(key, {
            condition: { etag: staleEtag(etag) },
          }),
        StorageErrorCode.CONFLICT,
        options,
      );
      equal(await context.client.exists(key), true);
      await context.client.deleteConditional(key, { condition: { etag } });
      equal(await context.client.exists(key), false);
    },
  );
}

function conditionalReadEtagCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const supported = options.expected.conditionalRead?.etag === true;
  return providerCase(
    options,
    supported
      ? 'reads only the requested ETag identity'
      : 'fails closed when ETag-conditional read is unsupported',
    async (context) => {
      const key = context.key('conditional-read-etag.txt');
      const original = await seed(context, key, 'observed');
      const etag = await resultEtag(context.client, key, original);
      if (!supported) {
        await expectStorageError(
          () =>
            context.client.downloadConditional(key, {
              condition: { etag },
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        return;
      }

      equal(
        await objectText(
          await context.client.downloadConditional(key, {
            condition: { etag },
          }),
        ),
        'observed',
      );
      await seed(context, key, 'changed');
      await expectStorageError(
        () =>
          context.client.downloadConditional(key, {
            condition: { etag },
          }),
        StorageErrorCode.CONFLICT,
        options,
      );
    },
  );
}

function conditionalReadVersionCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const supported = options.expected.conditionalRead?.version === true;
  return providerCase(
    options,
    supported
      ? 'reads an immutable provider version'
      : 'fails closed when version-conditional read is unsupported',
    async (context) => {
      const key = context.key('conditional-read-version.txt');
      await seed(context, key, 'version-one');
      if (!supported) {
        await expectStorageError(
          () =>
            context.client.downloadConditional(key, {
              condition: { version: 'unsupported-version' },
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        return;
      }

      const version = await context.resolveVersion(key);
      if (version === undefined) {
        return skippedVersion(options.provider);
      }
      await seed(context, key, 'version-two');
      equal(
        await objectText(
          await context.client.downloadConditional(key, {
            condition: { version },
          }),
        ),
        'version-one',
      );
    },
  );
}

function conditionalCopySourceEtagCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const supported = options.expected.conditionalCopySource?.etag === true;
  return providerCase(
    options,
    supported
      ? 'copies only the requested source ETag'
      : 'fails closed when source-ETag copy is unsupported',
    async (context) => {
      const source = context.key('copy-source-etag.txt');
      const destination = context.key('copy-source-etag-result.txt');
      const original = await seed(context, source, 'source-one');
      const etag = await resultEtag(context.client, source, original);
      if (!supported) {
        await expectStorageError(
          () =>
            context.client.promote(source, destination, { sourceEtag: etag }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        equal(await context.client.exists(destination), false);
        return;
      }

      await context.client.promote(source, destination, { sourceEtag: etag });
      equal(await readText(context.client, destination), 'source-one');
      const staleDestination = context.key('copy-source-etag-stale.txt');
      await seed(context, source, 'source-two');
      await expectStorageError(
        () =>
          context.client.promote(source, staleDestination, {
            sourceEtag: etag,
          }),
        StorageErrorCode.CONFLICT,
        options,
      );
      equal(await context.client.exists(staleDestination), false);
    },
  );
}

function conditionalCopySourceVersionCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const supported = options.expected.conditionalCopySource?.version === true;
  return providerCase(
    options,
    supported
      ? 'copies an immutable source version'
      : 'fails closed when source-version copy is unsupported',
    async (context) => {
      const source = context.key('copy-source-version.txt');
      const destination = context.key('copy-source-version-result.txt');
      await seed(context, source, 'source-version-one');
      if (!supported) {
        await expectStorageError(
          () =>
            context.client.promote(source, destination, {
              sourceVersion: 'unsupported-version',
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        equal(await context.client.exists(destination), false);
        return;
      }

      const version = await context.resolveVersion(source);
      if (version === undefined) {
        return skippedVersion(options.provider);
      }
      await seed(context, source, 'source-version-two');
      await context.client.promote(source, destination, {
        sourceVersion: version,
      });
      equal(await readText(context.client, destination), 'source-version-one');
    },
  );
}

function conditionalCopyDestinationCreateCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const supported =
    options.expected.conditionalCopyDestination?.create === true;
  return providerCase(
    options,
    supported
      ? 'enforces create-only copy at the destination'
      : 'fails closed when create-only destination copy is unsupported',
    async (context) => {
      const source = context.key('copy-destination-create-source.txt');
      const destination = context.key('copy-destination-create-result.txt');
      await seed(context, source, 'copy-created');
      if (!supported) {
        await expectStorageError(
          () =>
            context.client.promote(source, destination, {
              destination: { type: 'create' },
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        equal(await context.client.exists(destination), false);
        return;
      }

      await context.client.promote(source, destination, {
        destination: { type: 'create' },
      });
      equal(await readText(context.client, destination), 'copy-created');
      await expectStorageError(
        () =>
          context.client.promote(source, destination, {
            destination: { type: 'create' },
          }),
        StorageErrorCode.CONFLICT,
        options,
      );
    },
  );
}

function conditionalCopyDestinationReplaceCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const supported =
    options.expected.conditionalCopyDestination?.replace === true;
  return providerCase(
    options,
    supported
      ? 'enforces ETag replacement at the copy destination'
      : 'fails closed when destination replacement copy is unsupported',
    async (context) => {
      const source = context.key('copy-destination-replace-source.txt');
      const destination = context.key('copy-destination-replace-result.txt');
      await seed(context, source, 'replacement');
      const original = await seed(context, destination, 'destination-old');
      const etag = await resultEtag(context.client, destination, original);
      if (!supported) {
        await expectStorageError(
          () =>
            context.client.promote(source, destination, {
              destination: { etag, type: 'replace' },
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        equal(await readText(context.client, destination), 'destination-old');
        return;
      }

      await context.client.promote(source, destination, {
        destination: { etag, type: 'replace' },
      });
      equal(await readText(context.client, destination), 'replacement');
      await expectStorageError(
        () =>
          context.client.promote(source, destination, {
            destination: { etag, type: 'replace' },
          }),
        StorageErrorCode.CONFLICT,
        options,
      );
    },
  );
}

type SourceCopyPredicate = 'etag' | 'version';
type DestinationCopyPredicate = 'create' | 'replace';

function conditionalCopyAtomicityCases(
  options: StorageProviderConformanceOptions,
): readonly StorageProviderConformanceCase[] {
  const destination = options.expected.conditionalCopyDestination;
  const source = options.expected.conditionalCopySource;
  const sources: SourceCopyPredicate[] = [
    ...(source?.etag === true ? (['etag'] as const) : []),
    ...(source?.version === true ? (['version'] as const) : []),
  ];
  const destinations: DestinationCopyPredicate[] = [
    ...(destination?.create === true ? (['create'] as const) : []),
    ...(destination?.replace === true ? (['replace'] as const) : []),
  ];
  if (sources.length === 0 || destinations.length === 0) {
    return [conditionalCopyNonAtomicCase(options, 'etag', 'create')];
  }
  if (destination?.atomicWithSource !== true) {
    return sources.flatMap((sourcePredicate) =>
      destinations.map((destinationPredicate) =>
        conditionalCopyNonAtomicCase(
          options,
          sourcePredicate,
          destinationPredicate,
        ),
      ),
    );
  }

  return sources.flatMap((sourcePredicate) =>
    destinations.map((destinationPredicate) =>
      providerCase(
        options,
        `combines ${sourcePredicate} source and ${destinationPredicate} destination copy predicates atomically`,
        (context) =>
          verifyAtomicCopyCombination(
            context,
            options,
            sourcePredicate,
            destinationPredicate,
          ),
      ),
    ),
  );
}

async function verifyAtomicCopyCombination(
  context: CaseContext,
  options: StorageProviderConformanceOptions,
  sourcePredicate: SourceCopyPredicate,
  destinationPredicate: DestinationCopyPredicate,
): Promise<StorageProviderConformanceCaseResult | void> {
  const label = `${sourcePredicate}-${destinationPredicate}`;
  const sourceKey = context.key(`copy-atomic-${label}-source.txt`);
  const destinationKey = context.key(`copy-atomic-${label}-result.txt`);
  const original = await seed(context, sourceKey, 'source-original');
  const originalSource = await sourceCopyCondition(
    context,
    sourceKey,
    original,
    sourcePredicate,
  );
  if (originalSource === undefined) return skippedVersion(options.provider);

  const validDestination = await destinationCopyCondition(
    context,
    destinationKey,
    destinationPredicate,
    'destination-original',
  );

  const staleSource =
    sourcePredicate === 'etag'
      ? originalSource
      : { sourceVersion: `missing-${randomUUID()}` };
  if (sourcePredicate === 'etag') {
    await seed(context, sourceKey, 'source-current');
  }
  await expectAnyStorageError(
    () =>
      context.client.promote(sourceKey, destinationKey, {
        ...staleSource,
        ...validDestination,
      }),
    options,
  );
  await assertDestinationContent(
    context,
    destinationKey,
    destinationPredicate,
    'destination-original',
  );

  const currentSource = await sourceCopyCondition(
    context,
    sourceKey,
    await context.client.head(sourceKey),
    sourcePredicate,
  );
  if (currentSource === undefined) return skippedVersion(options.provider);
  const staleDestination = await staleDestinationCopyCondition(
    context,
    destinationKey,
    destinationPredicate,
  );
  await expectStorageError(
    () =>
      context.client.promote(sourceKey, destinationKey, {
        ...currentSource,
        ...staleDestination,
      }),
    StorageErrorCode.CONFLICT,
    options,
  );
  equal(await readText(context.client, destinationKey), 'destination-raced');

  const successDestination = await currentDestinationCopyCondition(
    context,
    destinationKey,
    destinationPredicate,
  );
  await context.client.promote(sourceKey, destinationKey, {
    ...currentSource,
    ...successDestination,
  });
  equal(
    await readText(context.client, destinationKey),
    sourcePredicate === 'etag' ? 'source-current' : 'source-original',
  );

  await verifyAtomicCopyRace(
    context,
    options,
    sourcePredicate,
    destinationPredicate,
    label,
  );
}

async function verifyAtomicCopyRace(
  context: CaseContext,
  options: StorageProviderConformanceOptions,
  sourcePredicate: SourceCopyPredicate,
  destinationPredicate: DestinationCopyPredicate,
  label: string,
): Promise<void> {
  const staleSourceKey = context.key(`copy-race-${label}-stale.txt`);
  const validSourceKey = context.key(`copy-race-${label}-valid.txt`);
  const destinationKey = context.key(`copy-race-${label}-destination.txt`);
  const staleResult = await seed(context, staleSourceKey, 'stale-original');
  const observedStale = await sourceCopyCondition(
    context,
    staleSourceKey,
    staleResult,
    sourcePredicate,
  );
  ok(
    observedStale !== undefined,
    'versioned provider stopped resolving versions during the atomicity race',
  );
  const staleCondition =
    sourcePredicate === 'etag'
      ? observedStale
      : { sourceVersion: `missing-${randomUUID()}` };
  if (sourcePredicate === 'etag') {
    await seed(context, staleSourceKey, 'stale-current');
  }

  const validResult = await seed(context, validSourceKey, 'race-winner');
  const validCondition = await sourceCopyCondition(
    context,
    validSourceKey,
    validResult,
    sourcePredicate,
  );
  ok(
    validCondition !== undefined,
    'versioned provider did not resolve the valid race source version',
  );
  const destinationCondition = await destinationCopyCondition(
    context,
    destinationKey,
    destinationPredicate,
    'race-destination',
  );

  const staleAttempt = expectAnyStorageError(
    () =>
      context.client.promote(staleSourceKey, destinationKey, {
        ...staleCondition,
        ...destinationCondition,
      }),
    options,
  );
  await Promise.resolve();
  const validAttempt = context.client.promote(validSourceKey, destinationKey, {
    ...validCondition,
    ...destinationCondition,
  });
  await Promise.all([staleAttempt, validAttempt]);
  equal(await readText(context.client, destinationKey), 'race-winner');
}

async function sourceCopyCondition(
  context: CaseContext,
  key: string,
  result: StorageUploadResult | { readonly etag?: string },
  predicate: SourceCopyPredicate,
): Promise<
  | { readonly sourceEtag: string }
  | { readonly sourceVersion: string }
  | undefined
> {
  if (predicate === 'etag') {
    return {
      sourceEtag: await resultEtag(context.client, key, result),
    };
  }
  const version = await context.resolveVersion(key);
  return version === undefined ? undefined : { sourceVersion: version };
}

async function destinationCopyCondition(
  context: CaseContext,
  key: string,
  predicate: DestinationCopyPredicate,
  body: string,
): Promise<
  | { readonly destination: { readonly type: 'create' } }
  | {
      readonly destination: {
        readonly etag: string;
        readonly type: 'replace';
      };
    }
> {
  if (predicate === 'create') {
    return { destination: { type: 'create' } };
  }
  const result = await seed(context, key, body);
  return {
    destination: {
      etag: await resultEtag(context.client, key, result),
      type: 'replace',
    },
  };
}

async function staleDestinationCopyCondition(
  context: CaseContext,
  key: string,
  predicate: DestinationCopyPredicate,
): ReturnType<typeof destinationCopyCondition> {
  if (predicate === 'create') {
    await seed(context, key, 'destination-raced');
    return { destination: { type: 'create' } };
  }
  const observed = await context.client.head(key);
  const etag = await resultEtag(context.client, key, observed);
  await seed(context, key, 'destination-raced');
  return { destination: { etag, type: 'replace' } };
}

async function currentDestinationCopyCondition(
  context: CaseContext,
  key: string,
  predicate: DestinationCopyPredicate,
): ReturnType<typeof destinationCopyCondition> {
  if (predicate === 'create') {
    await context.client.delete(key);
    return { destination: { type: 'create' } };
  }
  const current = await context.client.head(key);
  return {
    destination: {
      etag: await resultEtag(context.client, key, current),
      type: 'replace',
    },
  };
}

async function assertDestinationContent(
  context: CaseContext,
  key: string,
  predicate: DestinationCopyPredicate,
  expected: string,
): Promise<void> {
  if (predicate === 'create') {
    equal(await context.client.exists(key), false);
  } else {
    equal(await readText(context.client, key), expected);
  }
}

function conditionalCopyNonAtomicCase(
  options: StorageProviderConformanceOptions,
  sourcePredicate: SourceCopyPredicate,
  destinationPredicate: DestinationCopyPredicate,
): StorageProviderConformanceCase {
  return providerCase(
    options,
    `fails closed for combined ${sourcePredicate} source and ${destinationPredicate} destination when copy predicates are not atomic`,
    async (context) => {
      const sourceKey = context.key('copy-atomic-source.txt');
      const destinationKey = context.key('copy-atomic-result.txt');
      const original = await seed(context, sourceKey, 'atomic-copy');
      let sourceCondition: { sourceEtag: string } | { sourceVersion: string };
      if (sourcePredicate === 'version') {
        sourceCondition = { sourceVersion: 'unsupported-version' };
      } else {
        sourceCondition = {
          sourceEtag: await resultEtag(context.client, sourceKey, original),
        };
      }
      const destinationCondition =
        destinationPredicate === 'replace'
          ? {
              destination: {
                etag: await resultEtag(
                  context.client,
                  destinationKey,
                  await seed(context, destinationKey, 'destination-old'),
                ),
                type: 'replace' as const,
              },
            }
          : { destination: { type: 'create' as const } };
      const promotion = { ...sourceCondition, ...destinationCondition };
      const dispatchedBefore = context.dispatchCount?.();
      await expectStorageError(
        () => context.client.promote(sourceKey, destinationKey, promotion),
        StorageErrorCode.NOT_SUPPORTED,
        options,
      );
      if (dispatchedBefore !== undefined) {
        equal(
          context.dispatchCount?.(),
          dispatchedBefore,
          'non-atomic combined promotion reached the provider driver',
        );
      }
      if (destinationPredicate === 'replace') {
        equal(
          await readText(context.client, destinationKey),
          'destination-old',
        );
      } else {
        equal(await context.client.exists(destinationKey), false);
      }
    },
  );
}

function conditionalMultipartCreateCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const supported =
    options.expected.conditionalMultipartCompletion?.create === true;
  return providerCase(
    options,
    supported
      ? 'enforces create-only multipart completion'
      : 'fails closed when conditional multipart create is unsupported',
    async (context) => {
      const key = context.key('multipart-create.bin');
      if (!supported) {
        await expectStorageError(
          () =>
            context.client.uploadConditional(key, 'blocked', {
              condition: { type: 'create' },
              multipart: true,
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        equal(await context.client.exists(key), false);
        return;
      }

      const body = multipartBody(options);
      const result = await context.client.uploadConditional(key, body, {
        condition: { type: 'create' },
        multipart: { concurrency: 1, partSize: 5 * 1024 * 1024 },
      });
      assertResultEtag(
        result,
        options.expected.conditionalCreate?.resultEtag === true,
      );
      await expectStorageError(
        () =>
          context.client.uploadConditional(key, body, {
            condition: { type: 'create' },
            multipart: { concurrency: 1, partSize: 5 * 1024 * 1024 },
          }),
        StorageErrorCode.CONFLICT,
        options,
      );
    },
  );
}

function conditionalMultipartReplaceCase(
  options: StorageProviderConformanceOptions,
): StorageProviderConformanceCase {
  const supported =
    options.expected.conditionalMultipartCompletion?.replace === true;
  return providerCase(
    options,
    supported
      ? 'enforces ETag-conditional multipart replacement'
      : 'fails closed when conditional multipart replace is unsupported',
    async (context) => {
      const key = context.key('multipart-replace.bin');
      const original = await seed(context, key, 'multipart-original');
      const etag = await resultEtag(context.client, key, original);
      if (!supported) {
        await expectStorageError(
          () =>
            context.client.uploadConditional(key, 'blocked', {
              condition: { etag, type: 'replace' },
              multipart: true,
            }),
          StorageErrorCode.NOT_SUPPORTED,
          options,
        );
        equal(await readText(context.client, key), 'multipart-original');
        return;
      }

      const body = multipartBody(options);
      const result = await context.client.uploadConditional(key, body, {
        condition: { etag, type: 'replace' },
        multipart: { concurrency: 1, partSize: 5 * 1024 * 1024 },
      });
      assertResultEtag(
        result,
        options.expected.conditionalReplace?.resultEtag === true,
      );
      await expectStorageError(
        () =>
          context.client.uploadConditional(key, body, {
            condition: { etag, type: 'replace' },
            multipart: { concurrency: 1, partSize: 5 * 1024 * 1024 },
          }),
        StorageErrorCode.CONFLICT,
        options,
      );
    },
  );
}

function providerCase(
  options: StorageProviderConformanceOptions,
  name: string,
  operation: CaseOperation,
): StorageProviderConformanceCase {
  return Object.freeze({
    name,
    async run(): Promise<StorageProviderConformanceCaseResult> {
      return withFixture(options, operation);
    },
  });
}

async function withFixture(
  options: StorageProviderConformanceOptions,
  operation: CaseOperation,
): Promise<StorageProviderConformanceCaseResult> {
  const fixture = await options.createFixture();
  const keys = new Set<string>();
  const replicas: StorageClient[] = [];
  const namespace = `rockets-conformance/${safeSegment(
    options.provider,
  )}/${randomUUID()}`;
  const context: CaseContext = {
    client: fixture.client,
    ...(fixture.dispatchCount === undefined
      ? {}
      : { dispatchCount: fixture.dispatchCount }),
    async createReplica() {
      const replica = await fixture.createReplica();
      ok(
        replica !== fixture.client && !replicas.includes(replica),
        'createReplica must return a fresh StorageClient instance',
      );
      replicas.push(replica);
      equal(
        replica.name,
        fixture.client.name,
        'createReplica must address the same logical store name',
      );
      return replica;
    },
    key(label) {
      const key = `${namespace}/${label}`;
      keys.add(key);
      return key;
    },
    resolveVersion(key) {
      return fixture.resolveVersion?.(key) ?? Promise.resolve(undefined);
    },
    track(key) {
      keys.add(key);
      return key;
    },
  };

  const noError = Symbol('no-error');
  let operationError: unknown | typeof noError = noError;
  let result: StorageProviderConformanceCaseResult = PASSED;
  try {
    result = (await operation(context)) ?? PASSED;
  } catch (error: unknown) {
    operationError = error;
  }

  let cleanupError: unknown | typeof noError = noError;
  try {
    if (fixture.cleanup === undefined) {
      await cleanupWithClient(fixture.client, [...keys]);
    } else {
      await fixture.cleanup([...keys]);
    }
  } catch (error: unknown) {
    cleanupError = error;
  }
  for (const replica of replicas.reverse()) {
    try {
      await replica.onApplicationShutdown();
    } catch (error: unknown) {
      if (cleanupError === noError) cleanupError = error;
    }
  }
  try {
    await fixture.client.onApplicationShutdown();
  } catch (error: unknown) {
    if (cleanupError === noError) cleanupError = error;
  }
  try {
    await fixture.close?.();
  } catch (error: unknown) {
    if (cleanupError === noError) cleanupError = error;
  }

  if (operationError !== noError) throw operationError;
  if (cleanupError !== noError) throw cleanupError;
  return result;
}

async function cleanupWithClient(
  client: StorageClient,
  keys: readonly string[],
): Promise<void> {
  for (const key of keys) {
    try {
      await client.delete(key);
    } catch (error: unknown) {
      if (!isStorageError(error) || error.code !== StorageErrorCode.NOT_FOUND) {
        throw error;
      }
    }
  }
}

function conditionalCapabilitiesOf(
  capabilities: Readonly<StorageCapabilities>,
): StorageProviderConformanceCapabilities {
  const conditional: Partial<StorageProviderConformanceCapabilities> = {};
  for (const key of CONDITIONAL_CAPABILITY_KEYS) {
    const capability = capabilities[key];
    if (capability !== undefined) {
      Object.assign(conditional, { [key]: capability });
    }
  }
  ok(
    capabilities.physicalKey !== undefined,
    'provider must declare its complete physical-key byte budget',
  );
  return {
    ...conditional,
    physicalKey: capabilities.physicalKey,
    ...(capabilities.signedUploadPolicy === undefined
      ? {}
      : { signedUploadPolicy: capabilities.signedUploadPolicy }),
  };
}

async function seed(
  context: CaseContext,
  key: string,
  body: string | Uint8Array,
): Promise<StorageUploadResult> {
  context.track(key);
  const result = await context.client.upload(key, body);
  assertOptionalResultEtag(
    result,
    'provider upload returned a non-canonical ETag',
  );
  return result;
}

async function resultEtag(
  client: StorageClient,
  key: string,
  result: { readonly etag?: string },
): Promise<string> {
  const etag = result.etag ?? (await client.head(key)).etag;
  ok(
    isCanonicalStorageEtag(etag),
    'provider did not return a canonical bare strong ETag',
  );
  return etag;
}

function assertResultEtag(
  result: StorageUploadResult,
  required: boolean,
): void {
  assertOptionalResultEtag(
    result,
    'conditional write returned a non-canonical ETag',
  );
  if (required) {
    ok(
      isCanonicalStorageEtag(result.etag),
      'conditional write committed without the advertised result ETag',
    );
  }
}

function assertOptionalResultEtag(
  result: { readonly etag?: string },
  message: string,
): void {
  ok(result.etag === undefined || isCanonicalStorageEtag(result.etag), message);
}

async function readText(client: StorageClient, key: string): Promise<string> {
  return objectText(await client.downloadStream(key));
}

async function objectText(object: StorageObject): Promise<string> {
  assertOptionalResultEtag(
    object,
    'provider download returned a non-canonical ETag',
  );
  return new Response(object.body).text();
}

async function expectStorageError(
  operation: () => Promise<unknown>,
  code: StorageError['code'],
  options: StorageProviderConformanceOptions,
): Promise<StorageError> {
  try {
    await operation();
  } catch (error: unknown) {
    ok(isStorageError(error), 'provider operation did not return StorageError');
    equal(error.code, code);
    assertSanitizedError(error, options.forbiddenErrorValues ?? []);
    return error;
  }
  fail(`provider operation unexpectedly succeeded; expected ${code}`);
}

async function expectAnyStorageError(
  operation: () => Promise<unknown>,
  options: StorageProviderConformanceOptions,
): Promise<StorageError> {
  try {
    await operation();
  } catch (error: unknown) {
    ok(isStorageError(error), 'provider operation did not return StorageError');
    assertSanitizedError(error, options.forbiddenErrorValues ?? []);
    return error;
  }
  fail('provider operation unexpectedly succeeded');
}

function assertSanitizedError(
  error: StorageError,
  forbiddenValues: readonly string[],
): void {
  equal(error.cause, undefined, 'public storage error retained a raw cause');
  ok(error.message.length <= 512, 'public storage error is unexpectedly large');
  match(
    error.message,
    /^[^\r\n]*$/u,
    'public storage error contains line breaks',
  );
  ok(
    !/<(?:Error|Code|Message|RequestId|HostId)>/iu.test(error.message),
    'public storage error contains a serialized provider response',
  );
  const serialized = `${inspect(error, { depth: null })}\n${JSON.stringify({
    error,
  })}`;
  ok(
    !/(?:\$metadata|request.?id|host.?id|<Error>|<Message>)/iu.test(serialized),
    'public storage error serialization contains provider response metadata',
  );
  for (const value of forbiddenValues) {
    if (value.length > 0) {
      ok(
        !serialized.includes(value),
        'public storage error serialization contains a forbidden provider value',
      );
    }
  }
}

function staleEtag(etag: string): string {
  return etag === 'rockets-conformance-stale-etag'
    ? 'rockets-conformance-other-etag'
    : 'rockets-conformance-stale-etag';
}

function multipartBody(options: StorageProviderConformanceOptions): Uint8Array {
  return new Uint8Array(options.multipartBytes ?? DEFAULT_MULTIPART_BYTES);
}

function skippedVersion(
  provider: string,
): StorageProviderConformanceCaseResult {
  return {
    reason: `${provider} returned no version ID; use a dedicated version-enabled bucket to exercise this advertised subcapability`,
    status: 'skipped',
  };
}

function positiveSafeInteger(value: number, label: string): void {
  ok(
    Number.isSafeInteger(value) && value > 0,
    `${label} must be a positive safe integer`,
  );
}

function safeSegment(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'provider'
  );
}
