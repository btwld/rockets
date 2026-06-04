import type { PlainLiteralObject, Type } from '@nestjs/common';
import type { RepositoryModuleInterface } from '@bitwild/rockets-repository';
import type {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from './user-metadata.interface';

/**
 * User-metadata wiring for Rockets core + server: entity for the dynamic
 * repository, DTO classes for `/me` (and CQRS), optional response DTO, optional
 * adapter override.
 */
export interface RocketsUserMetadataConfig<
  TCreateDto extends UserMetadataCreatableInterface = UserMetadataCreatableInterface,
  TUpdateDto extends UserMetadataModelUpdatableInterface = UserMetadataModelUpdatableInterface,
> {
  readonly entity: Type<PlainLiteralObject>;
  readonly createDto: Type<TCreateDto>;
  readonly updateDto: Type<TUpdateDto>;
  readonly responseDto?: Type;
  /**
   * Override the root `repository` adapter for the user-metadata table only.
   * Useful when user-metadata lives in a different store than the rest of
   * the app (e.g. Firestore for metadata, TypeORM for everything else).
   */
  readonly repository?: RepositoryModuleInterface;
}
