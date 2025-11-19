import { AccessControlOptionsInterface } from '@concepta/nestjs-access-control';
import { AuthRouterOptionsExtrasInterface } from '@concepta/nestjs-auth-router';
import { CrudAdapter } from '@concepta/nestjs-crud';
import { RepositoryInterface } from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataCreateDtoInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-dto.interface';
import { RoleOptionsExtrasInterface } from '@concepta/nestjs-role/dist/interfaces/role-options-extras.interface';
import { DynamicModule, Type } from '@nestjs/common';
import { RocketsAuthUserEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserCreatableInterface } from '../../domains/user/interfaces/rockets-auth-user-creatable.interface';
import { RocketsAuthUserUpdatableInterface } from '../../domains/user/interfaces/rockets-auth-user-updatable.interface';
import { RocketsAuthRoleEntityInterface } from '../../domains/role/interfaces/rockets-auth-role-entity.interface';
import { RocketsAuthRoleCreatableInterface } from '../../domains/role/interfaces/rockets-auth-role-creatable.interface';
import { RocketsAuthRoleUpdatableInterface } from '../../domains/role/interfaces/rockets-auth-role-updatable.interface';
import { GenericUserMetadataModelService } from '../../domains/user/services/rockets-auth-user-metadata.model.service';

/**
 * Generic userMetadata configuration interface
 *
 * Allows clients to provide their own DTO classes for user metadata.
 * Follows the same pattern as rockets-server's UserMetadataConfigInterface.
 */
export interface UserMetadataConfigInterface<
  TCreateDto extends RocketsAuthUserMetadataCreateDtoInterface = RocketsAuthUserMetadataCreateDtoInterface,
  TUpdateDto extends RocketsAuthUserMetadataEntityInterface = RocketsAuthUserMetadataEntityInterface,
> {
  /**
   * Optional module imports for UserMetadata configuration
   * Use this for TypeORM entity registration when using test fixtures
   */
  imports?: any[];
  /**
   * Required adapter for user metadata entity. Relations are wired opinionately
   * as one-to-one on property 'userMetadata', foreignKey 'userId', primaryKey 'id'.
   * 
   * This is the ONLY place where userMetadataAdapter needs to be configured.
   */
  adapter: Type<CrudAdapter<RocketsAuthUserMetadataEntityInterface>>;
  /**
   * Entity class for user metadata.
   * Used for dynamic repository registration with TypeOrmExtModule.
   * ALWAYS required - every adapter has an associated entity.
   */
  entity: Type;
  /**
   * UserMetadata create DTO class
   * Must extend RocketsAuthUserMetadataCreateDtoInterface
   */
  createDto: new () => TCreateDto;
  /**
   * UserMetadata update DTO class
   * Must extend RocketsAuthUserMetadataEntityInterface
   */
  updateDto: new () => TUpdateDto;
  /**
   * Optional custom UserMetadataModelService override
   * If provided, this class will be instantiated instead of the default GenericUserMetadataModelService
   * Useful for implementing custom metadata logic while maintaining centralization
   */
  userMetadataModelService?: new (
    repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
    createDto: new () => TCreateDto,
    updateDto: new () => TUpdateDto,
  ) => GenericUserMetadataModelService;
}

export interface UserCrudOptionsExtrasInterface {
  /**
   * Module imports for user CRUD
   * 
   * IMPORTANT: Must include TypeOrmExtModule.forFeature with 'authUserMetadata' key:
   * TypeOrmExtModule.forFeature({ authUserMetadata: { entity: YourUserMetadataEntity } })
   * 
   * This is required for the AuthUserMetadataModelService to work correctly.
   */
  imports?: DynamicModule['imports'];
  path?: string;
  model: Type;
  adapter: Type<CrudAdapter<RocketsAuthUserEntityInterface>>;
  /**
   * UserMetadata configuration
   *
   * Provides adapter, entity, and DTO classes for user metadata.
   * Relations are wired opinionately as one-to-one on property 'userMetadata',
   * foreignKey 'userId', primaryKey 'id'.
   */
  userMetadataConfig: UserMetadataConfigInterface;
  dto?: {
    createOne?: Type<RocketsAuthUserCreatableInterface>;
    updateOne?: Type<RocketsAuthUserUpdatableInterface>;
  };
}

export interface RoleCrudOptionsExtrasInterface {
  imports?: DynamicModule['imports'];
  path?: string;
  model: Type;
  adapter: Type<CrudAdapter<RocketsAuthRoleEntityInterface>>;
  dto?: {
    createOne?: Type<RocketsAuthRoleCreatableInterface>;
    updateOne?: Type<RocketsAuthRoleUpdatableInterface>;
  };
}

export interface DisableControllerOptionsInterface {
  password?: boolean; // true = disabled
  refresh?: boolean; // true = disabled
  recovery?: boolean; // true = disabled
  otp?: boolean; // true = disabled
  oAuth?: boolean; // true = disabled
  signup?: boolean; // true = disabled (admin submodule)
  admin?: boolean; // true = disabled (admin submodule)
  adminRoles?: boolean; // true = disabled (roles admin submodule)
  user?: boolean; // legacy/tests compatibility
  invitation?: boolean; // true = disabled (invitation creation)
  invitationAcceptance?: boolean; // true = disabled (invitation acceptance)
  invitationRevocation?: boolean; // true = disabled (invitation revocation)
  invitationReattempt?: boolean; // true = disabled (invitation reattempt)
}

export interface RocketsAuthOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  /**
   * Enable global auth guard
   * When true, registers AuthGuard as APP_GUARD globally
   * When false, only provides AuthGuard as a service (not global)
   * Default: true
   */
  enableGlobalJWTGuard?: boolean;
  user?: { imports: DynamicModule['imports'] };
  otp?: { imports: DynamicModule['imports'] };
  federated?: { imports: DynamicModule['imports'] };
  role?: RoleOptionsExtrasInterface & { imports: DynamicModule['imports'] };
  authRouter?: AuthRouterOptionsExtrasInterface;
  userCrud?: UserCrudOptionsExtrasInterface;
  roleCrud?: RoleCrudOptionsExtrasInterface;
  /**
   * Optional access control configuration
   * If present, AccessControlModule will be registered
   * Used to configure role-based access control using the accesscontrol library
   */
  accessControl?: AccessControlOptionsInterface;
  disableController?: DisableControllerOptionsInterface;
  invitation?: {
    imports?: DynamicModule['imports']; // For registering invitation entity
  };
}
