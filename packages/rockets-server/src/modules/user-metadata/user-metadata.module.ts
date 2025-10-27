import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  RepositoryInterface,
  getDynamicRepositoryToken,
} from '@concepta/nestjs-common';
import {
  UserMetadataEntityInterface,
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from './interfaces/user-metadata.interface';
import {
  USER_METADATA_MODULE_ENTITY_KEY,
  UserMetadataModelService,
} from './constants/user-metadata.constants';
import { GenericUserMetadataModelService } from './services/user-metadata.model.service';
import { RAW_OPTIONS_TOKEN } from '../../rockets.tokens';
import { RocketsOptionsInterface } from '../../interfaces/rockets-options.interface';

export interface UserMetadataModuleOptionsInterface<
  TCreateDto extends UserMetadataCreatableInterface = UserMetadataCreatableInterface,
  TUpdateDto extends UserMetadataModelUpdatableInterface = UserMetadataModelUpdatableInterface,
> {
  createDto: new () => TCreateDto;
  updateDto: new () => TUpdateDto;
}

@Module({})
export class UserMetadataModule {
  static register(): DynamicModule {
    const providers: Provider[] = [
      {
        provide: UserMetadataModelService,
        inject: [
          RAW_OPTIONS_TOKEN,
          getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
        ],
        useFactory: (
          opts: RocketsOptionsInterface,
          repository: RepositoryInterface<UserMetadataEntityInterface>,
        ) => {
          const { createDto, updateDto } = opts.userMetadata;
          return new GenericUserMetadataModelService(
            repository,
            createDto,
            updateDto,
          );
        },
      },
    ];

    return {
      module: UserMetadataModule,
      providers,
      exports: [UserMetadataModelService],
    };
  }
}
