import { DynamicModule, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';
import { CqrsModule } from '@nestjs/cqrs';
import { UserModule } from './user.module';
import { MeController } from './gateways/http/me.controller';
import {
  USER_METADATA_MODULE_ENTITY_KEY,
  UpsertUserMetadataHandler,
  GetUserMetadataHandler,
} from '@bitwild/rockets-core';
import {
  RAW_OPTIONS_TOKEN,
  ROCKETS_USER_METADATA_DTO_TOKEN,
} from './rockets.tokens';
import type { RocketsOptions } from './rockets.module-definition';
import { StubUserMetadataEntity } from './__fixtures__/entities/stub-user-metadata.entity';
import type { RepositoryInterface } from '@bitwild/rockets-repository';
import type { UserMetadataEntityInterface } from '@bitwild/rockets-core';

class MetadataCreateDto {
  userId!: string;
}

class MetadataUpdateDto {
  id!: string;
}

function rocketsOptionsFixture(): RocketsOptions {
  return {
    settings: {},
    userMetadata: {
      entity: StubUserMetadataEntity,
      createDto: MetadataCreateDto,
      updateDto: MetadataUpdateDto,
    },
  };
}

function metadataRepositoryFixture(): jest.Mocked<
  RepositoryInterface<UserMetadataEntityInterface>
> {
  return {
    entityName: 'UserMetadata',
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    remove: jest.fn(),
    find: jest.fn(),
    merge: jest.fn(),
    gt: jest.fn(),
    gte: jest.fn(),
    lt: jest.fn(),
    lte: jest.fn(),
  } as unknown as jest.Mocked<RepositoryInterface<UserMetadataEntityInterface>>;
}

@Module({})
class UserModuleTestHarnessModule {
  static forTest(
    options: RocketsOptions,
    repo: jest.Mocked<RepositoryInterface<UserMetadataEntityInterface>>,
  ): DynamicModule {
    return {
      module: UserModuleTestHarnessModule,
      global: true,
      imports: [CqrsModule.forRoot()],
      providers: [
        { provide: RAW_OPTIONS_TOKEN, useValue: options },
        {
          // MeController reads only the narrowed DTO config token.
          provide: ROCKETS_USER_METADATA_DTO_TOKEN,
          useValue: {
            updateDto: options.userMetadata?.updateDto,
          },
        },
        {
          provide: getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
          useValue: repo,
        },
        UpsertUserMetadataHandler,
        GetUserMetadataHandler,
      ],
      exports: [
        RAW_OPTIONS_TOKEN,
        ROCKETS_USER_METADATA_DTO_TOKEN,
        getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
      ],
    };
  }
}

describe('UserModule', () => {
  it('register() loads MeController', async () => {
    const options = rocketsOptionsFixture();
    const repo = metadataRepositoryFixture();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        UserModuleTestHarnessModule.forTest(options, repo),
        UserModule.register(),
      ],
    }).compile();

    expect(moduleRef.get(MeController)).toBeInstanceOf(MeController);
  });
});
