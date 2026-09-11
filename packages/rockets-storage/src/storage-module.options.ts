import type {
  FactoryProvider,
  InjectionToken,
  ModuleMetadata,
  Type,
} from '@nestjs/common';

import type { StorageDriver } from './storage.driver.js';
import type { StoragePlugin } from './storage.types.js';

export interface StorageStoreDefinition {
  name?: string;
  driver: StorageDriver;
  plugins?: readonly StoragePlugin[];
}

export interface StorageModuleOptions {
  stores: readonly StorageStoreDefinition[];
  default?: string;
  plugins?: readonly StoragePlugin[];
  /** Makes the configured clients and manager globally injectable. Defaults to false. */
  isGlobal?: boolean;
}

export interface StorageFeatureOptions {
  stores: readonly StorageStoreDefinition[];
  plugins?: readonly StoragePlugin[];
  imports?: ModuleMetadata['imports'];
}

export interface StorageDriverFactory {
  createStorageDriver(name: string): StorageDriver | Promise<StorageDriver>;
}

interface StorageAsyncStoreCommon {
  name?: string;
  imports?: ModuleMetadata['imports'];
  plugins?: readonly StoragePlugin[];
}

export interface StorageFactoryStoreDefinition extends StorageAsyncStoreCommon {
  inject?: FactoryProvider['inject'];
  useFactory: (
    ...dependencies: never[]
  ) => StorageDriver | Promise<StorageDriver>;
  useClass?: never;
  useExisting?: never;
}

export interface StorageClassStoreDefinition extends StorageAsyncStoreCommon {
  useClass: Type<StorageDriverFactory>;
  inject?: never;
  useFactory?: never;
  useExisting?: never;
}

export interface StorageExistingStoreDefinition
  extends StorageAsyncStoreCommon {
  useExisting: InjectionToken<StorageDriverFactory>;
  inject?: never;
  useClass?: never;
  useFactory?: never;
}

export type StorageAsyncStoreDefinition =
  | StorageFactoryStoreDefinition
  | StorageClassStoreDefinition
  | StorageExistingStoreDefinition;

export interface StorageModuleAsyncOptions {
  stores: readonly StorageAsyncStoreDefinition[];
  default?: string;
  plugins?: readonly StoragePlugin[];
  imports?: ModuleMetadata['imports'];
  /** Makes the configured clients and manager globally injectable. Defaults to false. */
  isGlobal?: boolean;
}

export interface StorageFeatureAsyncOptions {
  stores: readonly StorageAsyncStoreDefinition[];
  plugins?: readonly StoragePlugin[];
  imports?: ModuleMetadata['imports'];
}
