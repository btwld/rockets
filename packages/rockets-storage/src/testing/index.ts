import type { StorageDriver } from '../storage.driver.js';
import {
  createFilesSdkDriver,
  type FilesSdkDriverOptions,
} from '../files-sdk/files-sdk.driver.js';
import {
  memory,
  type MemoryAdapter,
  type MemoryAdapterOptions,
} from 'files-sdk/memory';

export interface MemoryStorageDriverOptions
  extends Omit<FilesSdkDriverOptions<MemoryAdapter>, 'adapter'> {
  adapter?: MemoryAdapterOptions;
}

export function createMemoryStorageDriver(
  options: MemoryStorageDriverOptions = {},
): StorageDriver {
  const { adapter, ...filesOptions } = options;
  return createFilesSdkDriver({
    ...filesOptions,
    adapter: memory(adapter),
  });
}

export {
  createStorageProviderConformanceCases,
  type StorageProviderConformanceCapabilities,
  type StorageProviderConformanceCase,
  type StorageProviderConformanceCaseResult,
  type StorageProviderConformanceFixture,
  type StorageProviderConformanceOptions,
} from './provider-conformance.js';

export type { MemoryAdapterOptions, MemorySeed } from 'files-sdk/memory';
