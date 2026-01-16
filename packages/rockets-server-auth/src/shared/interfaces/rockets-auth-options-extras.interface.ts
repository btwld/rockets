import { AccessControlOptionsInterface } from '@concepta/nestjs-access-control';
import { AuthRouterOptionsExtrasInterface } from '@concepta/nestjs-auth-router';
import { CrudAdapter } from '@concepta/nestjs-crud';
import { RepositoryInterface } from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataCreatableInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-creatable.interface';
import { RoleOptionsExtrasInterface } from '@concepta/nestjs-role/dist/interfaces/role-options-extras.interface';
import { DynamicModule, Type } from '@nestjs/common';
import { RocketsAuthUserEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserCreatableInterface } from '../../domains/user/interfaces/rockets-auth-user-creatable.interface';
import { RocketsAuthUserUpdatableInterface } from '../../domains/user/interfaces/rockets-auth-user-updatable.interface';
import { RocketsAuthRoleEntityInterface } from '../../domains/role/interfaces/rockets-auth-role-entity.interface';
import { RocketsAuthRoleCreatableInterface } from '../../domains/role/interfaces/rockets-auth-role-creatable.interface';
import { RocketsAuthRoleUpdatableInterface } from '../../domains/role/interfaces/rockets-auth-role-updatable.interface';
import { GenericUserMetadataModelService } from '../../domains/user/services/rockets-auth-user-metadata.model.service';
import { RocketsAuthUserMetadataModelUpdatableInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-updatable.interface';

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
   * IMPORTANT: Must include TypeOrmExtModule.forFeature with 'authUserMetadata' key:
   * TypeOrmExtModule.forFeature(\{ authUserMetadata: \{ entity: YourUserMetadataEntity \} \})
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
 *
 * All controllers are **enabled by default**. Set a property to `true` to disable
 * that specific controller. This allows SDK users to selectively disable features
 * they don't need without requiring explicit enablement of every feature.
 *
 * @example
 * ```typescript
 * // Disable only the password and signup controllers
 * disableController: {
 *   password: true,
 *   signup: true,
 * }
 * ```
 *
 * @example
 * ```typescript
 * // All controllers enabled (default behavior, no config needed)
 * disableController: {}
 * ```
 */
export interface DisableControllerOptionsInterface {
  /** Set to `true` to disable the password change controller. Default: false (enabled) */
  password?: boolean;

  /** Set to `true` to disable the token refresh controller. Default: false (enabled) */
  refresh?: boolean;

  /** Set to `true` to disable the password recovery controller. Default: false (enabled) */
  recovery?: boolean;

  /** Set to `true` to disable the OTP (One-Time Password) controller. Default: false (enabled) */
  otp?: boolean;

  /** Set to `true` to disable the OAuth controllers (Google, Apple, GitHub, etc.). Default: false (enabled) */
  oAuth?: boolean;

  /** Set to `true` to disable the user signup controller. Default: false (enabled) */
  signup?: boolean;

  /** Set to `true` to disable the admin user management submodule. Default: false (enabled) */
  admin?: boolean;

  /** Set to `true` to disable the admin roles management submodule. Default: false (enabled) */
  adminRoles?: boolean;

  /**
   * Set to `true` to disable the user controller. Default: false (enabled)
   *
   * @deprecated Legacy/tests compatibility - prefer using specific controller flags
   */
  user?: boolean;

  /** Set to `true` to disable the invitation creation controller. Default: false (enabled) */
  invitation?: boolean;

  /** Set to `true` to disable the invitation acceptance controller. Default: false (enabled) */
  invitationAcceptance?: boolean;

  /** Set to `true` to disable the invitation revocation controller. Default: false (enabled) */
  invitationRevocation?: boolean;

  /** Set to `true` to disable the invitation reattempt controller. Default: false (enabled) */
  invitationReattempt?: boolean;
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
