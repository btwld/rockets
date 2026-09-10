import { vi, type Mocked, describe, it, expect } from 'vitest';
import { DynamicModule, Module, type Type } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CqrsModule } from '@nestjs/cqrs';
import {
  USER_METADATA_MODULE_ENTITY_KEY,
  UpsertUserMetadataHandler,
  GetUserMetadataHandler,
  getDynamicRepositoryToken,
} from '@concepta/rockets-core';
import type {
  RepositoryInterface,
  UserMetadataEntityInterface,
} from '@concepta/rockets-core';
import { UserModule } from './user.module';
import { userMetadataConfigFixture } from './__fixtures__/schemas/user-metadata.schema.fixture';

function metadataRepositoryFixture(): Mocked<
  RepositoryInterface<UserMetadataEntityInterface>
> {
  return {
    entityName: 'UserMetadata',
    findOne: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    remove: vi.fn(),
    find: vi.fn(),
    merge: vi.fn(),
    gt: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    lte: vi.fn(),
  } as unknown as Mocked<RepositoryInterface<UserMetadataEntityInterface>>;
}

@Module({})
class UserModuleTestHarnessModule {
  static forTest(
    repo: Mocked<RepositoryInterface<UserMetadataEntityInterface>>,
  ): DynamicModule {
    return {
      module: UserModuleTestHarnessModule,
      global: true,
      imports: [CqrsModule.forRoot()],
      providers: [
        {
          provide: getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
          useValue: repo,
        },
        UpsertUserMetadataHandler,
        GetUserMetadataHandler,
      ],
      exports: [getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY)],
    };
  }
}

// `buildMeController` returns a fresh class per config, so the only handle
// on the mounted controller is the module definition itself.
function registeredController(definition: DynamicModule): Type<unknown> {
  const [controller] = definition.controllers ?? [];
  if (controller === undefined) {
    throw new Error('UserModule.register() mounted no controller');
  }
  return controller;
}

describe('UserModule', () => {
  it('register() mounts the /me controller built from the userMetadata config', async () => {
    const userModule = UserModule.register(userMetadataConfigFixture);
    const controller = registeredController(userModule);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        UserModuleTestHarnessModule.forTest(metadataRepositoryFixture()),
        userModule,
      ],
    }).compile();

    expect(controller.name).toBe('MeController');
    expect(moduleRef.get(controller)).toBeInstanceOf(controller);
  });
});
