import 'reflect-metadata';

import { Injectable, Module } from '@nestjs/common';
import { ContextIdFactory, REQUEST } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { InjectStorage } from './inject-storage.decorator.js';
import { StorageClient } from './storage.client.js';
import type { StorageDriverFactory } from './storage-module.options.js';
import { StorageModule } from './storage.module.js';
import { StorageService } from './storage.service.js';
import { DEFAULT_STORAGE_NAME, getStorageToken } from './storage.tokens.js';
import { createMemoryStorageDriver } from './testing/index.js';

@Injectable()
class NamedConsumer {
  constructor(@InjectStorage('media') readonly client: StorageClient) {}
}

@Injectable()
class ClassDriverFactory implements StorageDriverFactory {
  createStorageDriver() {
    return createMemoryStorageDriver();
  }
}

const EXISTING_FACTORY = Symbol('EXISTING_FACTORY');

@Injectable()
class ExistingDriverFactory implements StorageDriverFactory {
  createStorageDriver() {
    return createMemoryStorageDriver();
  }
}

@Module({
  providers: [
    ExistingDriverFactory,
    {
      provide: EXISTING_FACTORY,
      useExisting: ExistingDriverFactory,
    },
  ],
  exports: [EXISTING_FACTORY],
})
class ExistingFactoryModule {}

const FACTORY_SEED = Symbol('FACTORY_SEED');

@Module({
  providers: [{ provide: FACTORY_SEED, useValue: 'seeded' }],
  exports: [FACTORY_SEED],
})
class FactoryDependencyModule {}

async function close(module: TestingModule | undefined): Promise<void> {
  await module?.close();
}

describe('StorageModule', () => {
  it('creates stable default and named tokens', () => {
    expect(getStorageToken()).toBe(getStorageToken(DEFAULT_STORAGE_NAME));
    expect(getStorageToken('media')).toBe(getStorageToken('media'));
    expect(getStorageToken('media')).not.toBe(getStorageToken('archive'));
  });

  it('registers named clients and a manager without becoming global', async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRoot({
          default: 'media',
          stores: [
            {
              driver: createMemoryStorageDriver(),
              name: 'media',
            },
            {
              driver: createMemoryStorageDriver(),
              name: 'archive',
            },
          ],
        }),
      ],
      providers: [NamedConsumer],
    }).compile();

    const consumer = module.get(NamedConsumer);
    const storage = module.get(StorageService);
    expect(consumer.client.name).toBe('media');
    expect(storage.use()).toBe(consumer.client);
    expect(storage.use('archive').name).toBe('archive');
    expect(storage.names).toEqual(['archive', 'media']);
    await module.close();
  });

  it('supports useFactory, useClass, and useExisting async stores', async () => {
    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRootAsync({
          default: 'factory',
          imports: [FactoryDependencyModule, ExistingFactoryModule],
          stores: [
            {
              inject: [FACTORY_SEED],
              name: 'factory',
              useFactory: (seed: string) =>
                createMemoryStorageDriver({
                  adapter: { initial: { [`${seed}.txt`]: seed } },
                }),
            },
            {
              name: 'class',
              useClass: ClassDriverFactory,
            },
            {
              name: 'existing',
              useExisting: EXISTING_FACTORY,
            },
          ],
        }),
      ],
    }).compile();

    const storage = module.get(StorageService);
    await expect(
      storage.use('factory').downloadText('seeded.txt'),
    ).resolves.toBe('seeded');
    expect(storage.use('class').driverName).toBe('memory');
    expect(storage.use('existing').driverName).toBe('memory');
    await module.close();
  });

  it('rejects duplicate names within one registration', () => {
    expect(() =>
      StorageModule.forRoot({
        stores: [
          {
            driver: createMemoryStorageDriver(),
            name: 'duplicate',
          },
          {
            driver: createMemoryStorageDriver(),
            name: 'duplicate',
          },
        ],
      }),
    ).toThrow('Duplicate storage store names');
  });

  it('keeps feature stores outside the root manager in either import order', async () => {
    @Injectable()
    class RootManagerConsumer {
      constructor(readonly storage: StorageService) {}
    }

    @Injectable()
    class FeatureConsumer {
      constructor(
        @InjectStorage('private-feature')
        readonly client: StorageClient,
      ) {}
    }

    const compile = async (featureFirst: boolean): Promise<TestingModule> => {
      const root = StorageModule.forRoot({
        stores: [
          {
            driver: createMemoryStorageDriver(),
            name: 'root',
          },
        ],
      });
      const feature = StorageModule.forFeature({
        stores: [
          {
            driver: createMemoryStorageDriver(),
            name: 'private-feature',
          },
        ],
      });

      @Module({
        imports: [root],
        providers: [RootManagerConsumer],
        exports: [RootManagerConsumer],
      })
      class RootArea {}

      @Module({
        imports: [feature],
        providers: [FeatureConsumer],
        exports: [FeatureConsumer],
      })
      class FeatureArea {}

      return Test.createTestingModule({
        imports: featureFirst
          ? [FeatureArea, RootArea]
          : [RootArea, FeatureArea],
      }).compile();
    };

    for (const featureFirst of [false, true]) {
      const module = await compile(featureFirst);
      const root = module.get(RootManagerConsumer).storage;
      expect(root.names).toEqual(['root']);
      expect(() => root.use('private-feature')).toThrow('is not registered');
      expect(module.get(FeatureConsumer).client.name).toBe('private-feature');
      await module.close();
    }
  });

  it('keeps duplicate state isolated between Nest application contexts', async () => {
    let first: TestingModule | undefined;
    let second: TestingModule | undefined;
    try {
      first = await Test.createTestingModule({
        imports: [
          StorageModule.forRoot({
            stores: [
              {
                driver: createMemoryStorageDriver(),
                name: 'same',
              },
            ],
          }),
        ],
      }).compile();
      second = await Test.createTestingModule({
        imports: [
          StorageModule.forRoot({
            stores: [
              {
                driver: createMemoryStorageDriver(),
                name: 'same',
              },
            ],
          }),
        ],
      }).compile();

      expect(first.get(getStorageToken('same'))).toBeInstanceOf(StorageClient);
      expect(second.get(getStorageToken('same'))).toBeInstanceOf(StorageClient);
    } finally {
      await close(first);
      await close(second);
    }
  });

  it('resolves request-scoped async stores independently per context', async () => {
    interface TenantRequest {
      seed: string;
    }

    const module = await Test.createTestingModule({
      imports: [
        StorageModule.forRootAsync({
          stores: [
            {
              inject: [REQUEST],
              name: 'tenant',
              useFactory: (request: TenantRequest) =>
                createMemoryStorageDriver({
                  adapter: {
                    initial: { 'tenant.txt': request.seed },
                  },
                }),
            },
          ],
        }),
      ],
    }).compile();

    const firstContext = ContextIdFactory.create();
    const secondContext = ContextIdFactory.create();
    module.registerRequestByContextId({ seed: 'first' }, firstContext);
    module.registerRequestByContextId({ seed: 'second' }, secondContext);

    const first = await module.resolve(StorageService, firstContext);
    const second = await module.resolve(StorageService, secondContext);
    await expect(first.use().downloadText('tenant.txt')).resolves.toBe('first');
    await expect(second.use().downloadText('tenant.txt')).resolves.toBe(
      'second',
    );
    expect(first.use()).not.toBe(second.use());
    await module.close();
  });

  it('requires explicit global registration for unrelated modules', async () => {
    const localRegistration = StorageModule.forRoot({
      stores: [
        {
          driver: createMemoryStorageDriver(),
          name: 'media',
        },
      ],
    });

    @Module({ imports: [localRegistration] })
    class LocalConfigurationModule {}

    @Module({ providers: [NamedConsumer] })
    class UnrelatedConsumerModule {}

    await expect(
      Test.createTestingModule({
        imports: [LocalConfigurationModule, UnrelatedConsumerModule],
      }).compile(),
    ).rejects.toThrow();

    const globalRegistration = StorageModule.forRoot({
      isGlobal: true,
      stores: [
        {
          driver: createMemoryStorageDriver(),
          name: 'media',
        },
      ],
    });

    @Module({ imports: [globalRegistration] })
    class GlobalConfigurationModule {}

    const module = await Test.createTestingModule({
      imports: [GlobalConfigurationModule, UnrelatedConsumerModule],
    }).compile();
    expect(module.get(NamedConsumer).client.name).toBe('media');
    await module.close();
  });
});
