import { AccessControlOptionsInterface } from '@concepta/nestjs-access-control';
import { AuthRouterOptionsExtrasInterface } from '@concepta/nestjs-auth-router';
import { CrudAdapter } from '@concepta/nestjs-crud';
import { RepositoryInterface } from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataCreatableInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-creatable.interface';
import { DynamicModule, Type } from '@nestjs/common';
import { RocketsAuthUserEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserCreatableInterface } from '../../domains/user/interfaces/rockets-auth-user-creatable.interface';
import { RocketsAuthUserUpdatableInterface } from '../../domains/user/interfaces/rockets-auth-user-updatable.interface';
import { RocketsAuthRoleEntityInterface } from '../../domains/role/interfaces/rockets-auth-role-entity.interface';
import { RocketsAuthRoleCreatableInterface } from '../../domains/role/interfaces/rockets-auth-role-creatable.interface';
import { RocketsAuthRoleUpdatableInterface } from '../../domains/role/interfaces/rockets-auth-role-updatable.interface';
import { GenericUserMetadataModelService } from '../../domains/user/services/rockets-auth-user-metadata.model.service';
import { RocketsAuthUserMetadataModelUpdatableInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-updatable.interface';
import { RoleOptionsExtrasInterface } from '../compat/concepta-internals';

/**
 * Generic userMetadata configuration interface
 *
 * Allows clients to provide their own DTO classes for user metadata.
 * Follows the same pattern as rockets-server's UserMetadataConfigInterface.
 */
export interface UserMetadataConfigInterface<
  TCreateDto extends RocketsAuthUserMetadataCreatableInterface = RocketsAuthUserMetadataCreatableInterface,
  TUpdateDto extends RocketsAuthUserMetadataModelUpdatableInterface = RocketsAuthUserMetadataModelUpdatableInterface,
> {
  /**
   * Optional module imports for UserMetadata configuration
   * Use this for TypeORM entity registration when using test fixtures
   */
  imports?: DynamicModule[];
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
   * IMPORTANT: Must include TypeOrmExtModule.forFeature with 'userMetadata' key:
   * TypeOrmExtModule.forFeature(\{ userMetadata: \{ entity: YourUserMetadataEntity \} \})
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

/**
 * Configuration interface for disabling specific controllers.
 */
export interface DisableControllerOptionsInterface {
  /** Disable password change controller. */
  password?: boolean;

  /** Disable token refresh controller. */
  refresh?: boolean;

  /** Disable password recovery controller. */
  recovery?: boolean;

  /** Disable OTP controller. */
  otp?: boolean;

  /** Disable OAuth controllers. */
  oAuth?: boolean;

  /** Disable user signup controller. */
  signup?: boolean;

  /** Disable admin user management submodule. */
  admin?: boolean;

  /** Disable admin roles management submodule. */
  adminRoles?: boolean;

  /**
   * Set to `true` to disable the user controller. Default: false (enabled)
   *
   * @deprecated Legacy/tests compatibility - prefer using specific controller flags
   */
  user?: boolean;

  /** Disable invitation creation controller. */
  invitation?: boolean;

  /** Disable invitation acceptance controller. */
  invitationAcceptance?: boolean;

  /** Disable invitation revocation controller. */
  invitationRevocation?: boolean;

  /** Disable invitation reattempt controller. */
  invitationReattempt?: boolean;

  /** Disable authenticated me/password controller. */
  mePassword?: boolean;
}

export interface RocketsAuthOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  /**
   * Register JWT auth guard as an application-wide guard.
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
   * Optional access control configuration.
   */
  accessControl?: AccessControlOptionsInterface;
  disableController?: DisableControllerOptionsInterface;
  invitation?: {
    imports?: DynamicModule['imports'];
  };
}
