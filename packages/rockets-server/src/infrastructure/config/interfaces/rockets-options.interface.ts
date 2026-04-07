import { RocketsSettingsInterface } from './rockets-settings.interface';
import {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '../../../domain/interfaces/user-metadata.interface';
import { AuthProviderInterface } from '../../../domain/interfaces/auth-provider.interface';
import { SwaggerUiOptionsInterface } from '@concepta/nestjs-swagger-ui';

/**
 * Generic userMetadata configuration interface.
 * Allows clients to provide their own entity and DTO classes.
 */
export interface UserMetadataConfigInterface<
  TCreateDto extends UserMetadataCreatableInterface = UserMetadataCreatableInterface,
  TUpdateDto extends UserMetadataModelUpdatableInterface = UserMetadataModelUpdatableInterface,
> {
  createDto: new () => TCreateDto;
  updateDto: new () => TUpdateDto;
}

export interface RocketsOptionsInterface {
  settings?: RocketsSettingsInterface;
  swagger?: SwaggerUiOptionsInterface;
  authProvider: AuthProviderInterface;
  userMetadata: UserMetadataConfigInterface;
}
