import { DynamicModule, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { UserMetadataModule } from './user-metadata.module';
import {
  USER_METADATA_MODULE_ENTITY_KEY,
  UserMetadataModelService,
} from './constants/user-metadata.constants';
import { GenericUserMetadataModelService } from './services/user-metadata.model.service';
import { RAW_OPTIONS_TOKEN } from '../../rockets.tokens';
import type { RocketsOptionsInterface } from '../../interfaces/rockets-options.interface';
import type { AuthProviderInterface } from '../../interfaces/auth-provider.interface';
import type { AuthorizedUser } from '../../interfaces/auth-user.interface';
import type { RepositoryInterface } from '@concepta/nestjs-repository';
import type { UserMetadataEntityInterface } from './interfaces/user-metadata.interface';

class MetadataCreateDto {
  userId!: string;
}

class MetadataUpdateDto {
  id!: string;
}

function minimalAuthProvider(): AuthProviderInterface {
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

function minimalRocketsOptions(): RocketsOptionsInterface {
  return {
    settings: {},
    authProvider: minimalAuthProvider(),
    userMetadata: {
      createDto: MetadataCreateDto,
      updateDto: MetadataUpdateDto,
    },
  };
}

function minimalMetadataRepository(): jest.Mocked<
  RepositoryInterface<UserMetadataEntityInterface>
> {
  return {
    entityName: 'UserMetadata',
    findOne: jest.fn(),
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
class UserMetadataModuleTestHarnessModule {
  static forTest(
    options: RocketsOptionsInterface,
    repo: jest.Mocked<RepositoryInterface<UserMetadataEntityInterface>>,
  ): DynamicModule {
    return {
      module: UserMetadataModuleTestHarnessModule,
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

describe('UserMetadataModule', () => {
  it('register() wires GenericUserMetadataModelService as UserMetadataModelService', async () => {
    const repo = minimalMetadataRepository();
    const options = minimalRocketsOptions();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        UserMetadataModuleTestHarnessModule.forTest(options, repo),
        UserMetadataModule.register(),
      ],
    }).compile();

    const service = moduleRef.get(UserMetadataModelService);
    expect(service).toBeInstanceOf(GenericUserMetadataModelService);
    expect(service.createDto).toBe(MetadataCreateDto);
    expect(service.updateDto).toBe(MetadataUpdateDto);
  });
});
