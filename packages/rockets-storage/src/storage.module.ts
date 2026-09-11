import {
  Module,
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
  type Provider,
} from '@nestjs/common';

import { StorageClient } from './storage.client.js';
import type { StorageDriver } from './storage.driver.js';
import type {
  StorageAsyncStoreDefinition,
  StorageFeatureAsyncOptions,
  StorageFeatureOptions,
  StorageModuleAsyncOptions,
  StorageModuleOptions,
  StorageStoreDefinition,
} from './storage-module.options.js';
import { StorageService } from './storage.service.js';
import {
  DEFAULT_STORAGE_NAME,
  STORAGE_DEFAULT_NAME,
  getStorageToken,
  normalizeStorageName,
} from './storage.tokens.js';
import type { StoragePlugin } from './storage.types.js';

interface PreparedStore {
  name: string;
  driver: StorageDriver;
  plugins: readonly StoragePlugin[];
}

interface PreparedAsyncStore {
  name: string;
  definition: StorageAsyncStoreDefinition;
  plugins: readonly StoragePlugin[];
}

@Module({})
export class StorageFeatureModule {}

function assertStores(names: readonly string[]): void {
  if (names.length === 0) {
    throw new TypeError('At least one storage store must be configured.');
  }
  const duplicates = names.filter(
    (name, index) => names.indexOf(name) !== index,
  );
  if (duplicates.length > 0) {
    throw new TypeError(
      `Duplicate storage store names: ${[...new Set(duplicates)].join(', ')}.`,
    );
  }
}

function resolveDefaultName(
  names: readonly string[],
  requested?: string,
): string | null {
  if (requested !== undefined) {
    const normalized = normalizeStorageName(requested);
    if (!names.includes(normalized)) {
      throw new TypeError(
        `Default storage store "${normalized}" is not present in this registration.`,
      );
    }
    return normalized;
  }
  if (names.length === 1) {
    return names[0] ?? null;
  }
  return names.includes(DEFAULT_STORAGE_NAME) ? DEFAULT_STORAGE_NAME : null;
}

function prepareStores(
  stores: readonly StorageStoreDefinition[],
  plugins: readonly StoragePlugin[] = [],
): PreparedStore[] {
  const prepared = stores.map((store) => ({
    driver: store.driver,
    name: normalizeStorageName(store.name),
    plugins: [...plugins, ...(store.plugins ?? [])],
  }));
  assertStores(prepared.map((store) => store.name));
  return prepared;
}

function prepareAsyncStores(
  stores: readonly StorageAsyncStoreDefinition[],
  plugins: readonly StoragePlugin[] = [],
): PreparedAsyncStore[] {
  const prepared = stores.map((definition) => ({
    definition,
    name: normalizeStorageName(definition.name),
    plugins: [...plugins, ...(definition.plugins ?? [])],
  }));
  assertStores(prepared.map((store) => store.name));
  return prepared;
}

function uniqueImports(
  root: ModuleMetadata['imports'] = [],
  stores: readonly PreparedAsyncStore[] = [],
): NonNullable<ModuleMetadata['imports']> {
  return [
    ...new Set([
      ...root,
      ...stores.flatMap((store) => store.definition.imports ?? []),
    ]),
  ];
}

function serviceProvider(
  defaultName: string | null,
  names: readonly string[],
): Provider[] {
  const storeTokens = names.map((name) => getStorageToken(name));
  return [
    { provide: STORAGE_DEFAULT_NAME, useValue: defaultName },
    {
      provide: StorageService,
      inject: [STORAGE_DEFAULT_NAME, ...storeTokens],
      useFactory: (
        configuredDefault: string | null,
        ...clients: StorageClient[]
      ): StorageService => {
        return new StorageService(
          new Map(names.map((name, index) => [name, clients[index]!])),
          configuredDefault,
        );
      },
    },
  ];
}

function syncDynamicModule(
  module: typeof StorageModule | typeof StorageFeatureModule,
  stores: readonly PreparedStore[],
  defaultName: string | null,
  global: boolean,
  includeService: boolean,
  imports: ModuleMetadata['imports'] = [],
): DynamicModule {
  const clientProviders: Provider[] = stores.map((store) => ({
    provide: getStorageToken(store.name),
    useFactory: () =>
      new StorageClient(store.name, store.driver, store.plugins),
  }));
  const storeTokens = stores.map((store) => getStorageToken(store.name));
  const names = stores.map((store) => store.name);

  return {
    module,
    global,
    imports: uniqueImports(imports),
    providers: [
      ...clientProviders,
      ...(includeService ? serviceProvider(defaultName, names) : []),
    ],
    exports: [...storeTokens, ...(includeService ? [StorageService] : [])],
  };
}

function asyncClientProvider(store: PreparedAsyncStore): {
  client: FactoryProvider;
  extra?: Provider;
} {
  const token = getStorageToken(store.name);
  const definition = store.definition;

  if (definition.useFactory !== undefined) {
    const factory = definition.useFactory as unknown as (
      ...dependencies: unknown[]
    ) => StorageDriver | Promise<StorageDriver>;
    return {
      client: {
        provide: token,
        inject: definition.inject ?? [],
        useFactory: async (...dependencies: unknown[]) =>
          new StorageClient(
            store.name,
            await factory(...dependencies),
            store.plugins,
          ),
      },
    };
  }

  if (definition.useClass !== undefined) {
    return {
      client: {
        provide: token,
        inject: [definition.useClass],
        useFactory: async (factory) =>
          new StorageClient(
            store.name,
            await factory.createStorageDriver(store.name),
            store.plugins,
          ),
      },
      extra: definition.useClass,
    };
  }

  return {
    client: {
      provide: token,
      inject: [definition.useExisting],
      useFactory: async (factory) =>
        new StorageClient(
          store.name,
          await factory.createStorageDriver(store.name),
          store.plugins,
        ),
    },
  };
}

function asyncDynamicModule(
  module: typeof StorageModule | typeof StorageFeatureModule,
  stores: readonly PreparedAsyncStore[],
  defaultName: string | null,
  global: boolean,
  includeService: boolean,
  imports: ModuleMetadata['imports'] = [],
): DynamicModule {
  const clients = stores.map(asyncClientProvider);
  const extras = clients
    .map(({ extra }) => extra)
    .filter((provider): provider is Provider => provider !== undefined);
  const storeTokens = stores.map((store) => getStorageToken(store.name));

  return {
    module,
    global,
    imports: uniqueImports(imports, stores),
    providers: [
      ...new Set(extras),
      ...clients.map(({ client }) => client),
      ...(includeService
        ? serviceProvider(
            defaultName,
            stores.map((store) => store.name),
          )
        : []),
    ],
    exports: [...storeTokens, ...(includeService ? [StorageService] : [])],
  };
}

@Module({})
export class StorageModule {
  static forRoot(options: StorageModuleOptions): DynamicModule {
    const stores = prepareStores(options.stores, options.plugins);
    return syncDynamicModule(
      StorageModule,
      stores,
      resolveDefaultName(
        stores.map((store) => store.name),
        options.default,
      ),
      options.isGlobal === true,
      true,
    );
  }

  static forRootAsync(options: StorageModuleAsyncOptions): DynamicModule {
    const stores = prepareAsyncStores(options.stores, options.plugins);
    return asyncDynamicModule(
      StorageModule,
      stores,
      resolveDefaultName(
        stores.map((store) => store.name),
        options.default,
      ),
      options.isGlobal === true,
      true,
      options.imports,
    );
  }

  static forFeature(options: StorageFeatureOptions): DynamicModule {
    const stores = prepareStores(options.stores, options.plugins);
    return syncDynamicModule(
      StorageFeatureModule,
      stores,
      null,
      false,
      false,
      options.imports,
    );
  }

  static forFeatureAsync(options: StorageFeatureAsyncOptions): DynamicModule {
    const stores = prepareAsyncStores(options.stores, options.plugins);
    return asyncDynamicModule(
      StorageFeatureModule,
      stores,
      null,
      false,
      false,
      options.imports,
    );
  }
}
