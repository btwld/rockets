import { DynamicModule, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { UserModule } from './user.module';
import { MeController } from './me.controller';
import {
  USER_METADATA_MODULE_ENTITY_KEY,
  UserMetadataModelService,
} from '../user-metadata/constants/user-metadata.constants';
import { GenericUserMetadataModelService } from '../user-metadata/services/user-metadata.model.service';
import { RAW_OPTIONS_TOKEN } from '../../rockets.tokens';
import type { RocketsOptionsInterface } from '../../interfaces/rockets-options.interface';
import type { AuthProviderInterface } from '../../interfaces/auth-provider.interface';
import type { AuthorizedUser } from '../../interfaces/auth-user.interface';
import type { RepositoryInterface } from '@concepta/nestjs-repository';
import type { UserMetadataEntityInterface } from '../user-metadata/interfaces/user-metadata.interface';

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
  } as unknown as jest.Mocked<
    RepositoryInterface<UserMetadataEntityInterface>
  >;
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
      providers: [
        { provide: RAW_OPTIONS_TOKEN, useValue: options },
        {
          provide: getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
          useValue: repo,
        },
      ],
      exports: [
        RAW_OPTIONS_TOKEN,
        getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
      ],
    };
  }
}

describe('UserModule', () => {
  it('register() loads MeController and user metadata service graph', async () => {
    const options = rocketsOptionsFixture();
    const repo = metadataRepositoryFixture();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        UserModuleTestHarnessModule.forTest(options, repo),
        UserModule.register(),
      ],
    }).compile();

    expect(moduleRef.get(MeController)).toBeInstanceOf(MeController);
    const metadataService = moduleRef.get(UserMetadataModelService);
    expect(metadataService).toBeInstanceOf(GenericUserMetadataModelService);
  });
});
