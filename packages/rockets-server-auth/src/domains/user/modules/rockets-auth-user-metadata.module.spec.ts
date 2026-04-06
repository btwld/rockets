import { DynamicModule, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDynamicRepositoryToken, RepositoryInterface } from '@concepta/nestjs-repository';
import { RocketsAuthUserMetadataModule } from './rockets-auth-user-metadata.module';
import {
  RAW_USER_METADATA_OPTIONS_TOKEN,
} from './rockets-auth-user-metadata.module-definition';
import {
  USER_METADATA_MODULE_ENTITY_KEY,
  UserMetadataModelService,
} from '../infrastructure/config/user-metadata.constants';
import { GenericUserMetadataModelService } from '../infrastructure/services/rockets-auth-user-metadata.model.service';
import type { RocketsAuthUserMetadataEntityInterface } from '../interfaces/rockets-auth-user-metadata-entity.interface';

class TestMetaEntity {}

class TestCreateDto {
  userId!: string;
}

class TestUpdateDto {
  id!: string;
}

class CustomUserMetadataModelService extends GenericUserMetadataModelService {}

@Module({})
class UserMetadataRepoHarnessModule {
  static forTest(
    repo: jest.Mocked<
      RepositoryInterface<RocketsAuthUserMetadataEntityInterface>
    >,
  ): DynamicModule {
    const token = getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY);
    return {
      module: UserMetadataRepoHarnessModule,
      global: true,
      providers: [{ provide: token, useValue: repo }],
      exports: [token],
    };
  }
}

describe('RocketsAuthUserMetadataModule', () => {
  const minimalRepo = (): jest.Mocked<
    RepositoryInterface<RocketsAuthUserMetadataEntityInterface>
  > =>
    ({
      entityName: 'm',
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
    }) as unknown as jest.Mocked<
      RepositoryInterface<RocketsAuthUserMetadataEntityInterface>
    >;

  it('forRoot wires default GenericUserMetadataModelService', async () => {
    const repo = minimalRepo();
    const mod = await Test.createTestingModule({
      imports: [
        UserMetadataRepoHarnessModule.forTest(repo),
        RocketsAuthUserMetadataModule.forRoot({
          entity: TestMetaEntity,
          createDto: TestCreateDto,
          updateDto: TestUpdateDto,
        }),
      ],
    }).compile();

    const svc = mod.get(UserMetadataModelService);
    expect(svc).toBeInstanceOf(GenericUserMetadataModelService);
  });

  it('forRoot uses userMetadataModelService override when provided', async () => {
    const repo = minimalRepo();
    const mod = await Test.createTestingModule({
      imports: [
        UserMetadataRepoHarnessModule.forTest(repo),
        RocketsAuthUserMetadataModule.forRoot({
          entity: TestMetaEntity,
          createDto: TestCreateDto,
          updateDto: TestUpdateDto,
          userMetadataModelService: CustomUserMetadataModelService,
        }),
      ],
    }).compile();

    const svc = mod.get(UserMetadataModelService);
    expect(svc).toBeInstanceOf(CustomUserMetadataModelService);
  });

  it('forRootAsync provides options token', async () => {
    const repo = minimalRepo();
    const mod = await Test.createTestingModule({
      imports: [
        UserMetadataRepoHarnessModule.forTest(repo),
        RocketsAuthUserMetadataModule.forRootAsync({
          useFactory: () => ({
            entity: TestMetaEntity,
            createDto: TestCreateDto,
            updateDto: TestUpdateDto,
          }),
        }),
      ],
    }).compile();

    expect(mod.get(RAW_USER_METADATA_OPTIONS_TOKEN)).toMatchObject({
      entity: TestMetaEntity,
    });
  });
});
