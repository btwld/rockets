import type { Type } from '@nestjs/common';
import type {
  OtpInterface,
  RoleAssignmentEntityInterface,
  RoleEntityInterface,
  UserCredentialInterface,
  UserEntityInterface,
} from '@concepta/nestjs-common';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository/dist/interfaces/repository-module.interface';
import type { RocketsAuthUserMetadataEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-entity.interface';

/**
 * Entity classes that Rockets Auth needs for repository persistence.
 *
 * Keys are friendly identifiers; the library maps them internally
 * to canonical repository keys (USER_CRUD_ENTITY_KEY, etc.).
 */
export interface RocketsAuthRepositoryPersistenceEntities {
  readonly user: Type<UserEntityInterface>;
  readonly userCredentials: Type<UserCredentialInterface>;
  readonly userMetadata?: Type<RocketsAuthUserMetadataEntityInterface>;
  readonly userOtp?: Type<OtpInterface>;
  readonly role?: Type<RoleEntityInterface>;
  readonly userRole?: Type<RoleAssignmentEntityInterface>;
}

/**
 * Persistence configuration passed on `RocketsAuthOptionsExtrasInterface`.
 *
 * When provided, Rockets registers `RepositoryModule.forFeature` and
 * conditional `OtpModule.forFeature` internally so apps don't repeat
 * canonical key strings.
 */
export interface RocketsAuthRepositoryPersistenceOptions {
  /** Repository adapter module (e.g. TypeOrmRepositoryModule). */
  readonly module: RepositoryModuleInterface;
  /** Entity classes keyed by friendly identifiers. */
  readonly entities: RocketsAuthRepositoryPersistenceEntities;
}
