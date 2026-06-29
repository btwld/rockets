import type { Type } from '@nestjs/common';
import type { OtpInterface } from '@concepta/nestjs-otp';
import type {
  UserEntityInterface,
  UserCredentialInterface,
} from '@concepta/nestjs-user';
import type {
  RoleEntityInterface,
  RoleAssignmentEntityInterface,
} from '@concepta/nestjs-role';
import type { IdentityEntityInterface } from '@concepta/nestjs-federated';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';

/**
 * Entity classes that Rockets Auth needs for repository persistence.
 *
 * Keys are friendly identifiers; the library maps them internally
 * to canonical repository keys (USER_CRUD_ENTITY_KEY, etc.).
 *
 * The `userMetadata` entity is intentionally not part of this shape —
 * it is configured separately via the `userMetadata` field on
 * `DefineRocketsAuthInput` (single source of truth consumed by core).
 */
export interface RocketsAuthRepositoryPersistenceEntities {
  readonly user: Type<UserEntityInterface>;
  readonly userCredentials: Type<UserCredentialInterface>;
  readonly userOtp?: Type<OtpInterface>;
  readonly role?: Type<RoleEntityInterface>;
  readonly userRole?: Type<RoleAssignmentEntityInterface>;
  /** Federated identity store (e.g. OAuth link rows); key `identity` in `RepositoryModule`. */
  readonly federatedIdentity?: Type<IdentityEntityInterface>;
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
