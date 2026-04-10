import { RocketsSettingsInterface } from './rockets-settings.interface';
import type {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';
import type { AuthProviderInterface } from '@bitwild/rockets-core';
import type { SwaggerUiOptionsInterface } from '@bitwild/rockets-common';

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
