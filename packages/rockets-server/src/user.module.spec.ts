import { DynamicModule, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { CqrsModule } from '@nestjs/cqrs';
import { UserModule } from './user.module';
import { MeController } from './gateways/http/me.controller';
import {
  USER_METADATA_MODULE_ENTITY_KEY,
  UpsertUserMetadataHandler,
  GetUserMetadataHandler,
} from '@bitwild/rockets-core';
import { RAW_OPTIONS_TOKEN } from './rockets.tokens';
import type { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import type { AuthProviderInterface } from './domain/interfaces/auth-provider.interface';
import type { AuthorizedUser } from './domain/interfaces/auth-user.interface';
import type { RepositoryInterface } from '@concepta/nestjs-repository';
import type { UserMetadataEntityInterface } from '@bitwild/rockets-core';

class MetadataCreateDto {
  userId!: string;
}

class MetadataUpdateDto {
  id!: string;
}

function authProviderFixture(): AuthProviderInterface {
  const user: AuthorizedUser = {
    id: 'u1',
    sub: 'u1',
    claims: {},
    userRoles: [],
  };
  return {
    validateToken: jest.fn().mockResolvedValue(user),
  };
}

function rocketsOptionsFixture(): RocketsOptionsInterface {
  return {
    settings: {},
    authProvider: authProviderFixture(),
    userMetadata: {
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
    options: RocketsOptionsInterface,
    repo: jest.Mocked<RepositoryInterface<UserMetadataEntityInterface>>,
  ): DynamicModule {
    return {
      module: UserModuleTestHarnessModule,
      global: true,
      imports: [CqrsModule.forRoot()],
      providers: [
        { provide: RAW_OPTIONS_TOKEN, useValue: options },
        {
          provide: getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
          useValue: repo,
        },
        UpsertUserMetadataHandler,
        GetUserMetadataHandler,
      ],
      exports: [
        RAW_OPTIONS_TOKEN,
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
