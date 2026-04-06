import { AccessControlOptionsInterface } from '@concepta/nestjs-access-control';
import type { CanAccess } from '@concepta/nestjs-access-control';
import { AuthRouterOptionsExtrasInterface } from '@concepta/nestjs-auth-router';
import { RepositoryInterface } from '@concepta/nestjs-repository';
import { RocketsAuthUserMetadataEntityInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-entity.interface';
import { RocketsAuthUserMetadataCreatableInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-creatable.interface';
import { DynamicModule, Provider, Type } from '@nestjs/common';
import { RocketsAuthUserCreatableInterface } from '../../domains/user/interfaces/rockets-auth-user-creatable.interface';
import { RocketsAuthUserUpdatableInterface } from '../../domains/user/interfaces/rockets-auth-user-updatable.interface';
import { RocketsAuthRoleEntityInterface } from '../../domains/role/interfaces/rockets-auth-role-entity.interface';
import { RocketsAuthRoleCreatableInterface } from '../../domains/role/interfaces/rockets-auth-role-creatable.interface';
import { RocketsAuthRoleUpdatableInterface } from '../../domains/role/interfaces/rockets-auth-role-updatable.interface';
import { RocketsAuthUserMetadataModelServiceInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-model-service.interface';
import { RocketsAuthUserMetadataModelUpdatableInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-updatable.interface';
import { RoleOptionsExtrasInterface } from '../compat/concepta-internals';
import { RocketsAuthRepositoryPersistenceOptions } from './rockets-auth-repository-persistence.interface';
import { RocketsAuthPortsConfigInterface } from './rockets-auth-ports-config.interface';
import {
  AbstractSignupUserHandler,
  SignupUserCommand,
} from '../../domains/user';
import { AbstractAdminUserListHandler } from '../../domains/user/application/commands/handlers/abstract-admin-user-list.handler';
import { AbstractAdminUserReadHandler } from '../../domains/user/application/commands/handlers/abstract-admin-user-read.handler';
import { AbstractAdminUserUpdateHandler } from '../../domains/user/application/commands/handlers/abstract-admin-user-update.handler';
import { AbstractAdminDeleteUserHandler } from '../../domains/user/application/commands/handlers/abstract-admin-delete-user.handler';

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
   * Optional module imports for UserMetadata configuration.
   * Accepts module classes, dynamic modules, or forward references.
   */
  imports?: DynamicModule['imports'];

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
   *
   * TODO: Replace this extension point with a custom UserMetadataRepository (or handler) when
   * UserMetadataModelService is removed.
   */
  userMetadataModelService?: new (
    repo: RepositoryInterface<RocketsAuthUserMetadataEntityInterface>,
    createDto: new () => TCreateDto,
    updateDto: new () => TUpdateDto,
  ) => RocketsAuthUserMetadataModelServiceInterface;
}

export interface UserCrudOptionsExtrasInterface {
  /**
   * Module imports for user CRUD
   *
   * Must include TypeOrmExtModule.forFeature with entity registrations:
   * - `USER_CRUD_ENTITY_KEY` for the user repository
   * - `USER_METADATA_MODULE_ENTITY_KEY` for the metadata repository
   */
  imports?: DynamicModule['imports'];
  path?: string;
  model?: Type;

  /**
   * TypeORM entity class.
   * Used by admin module for CrudAdapter registration.
   */
  entity?: Type;
  /**
   * UserMetadata configuration
   *
   * Provides adapter, entity, and DTO classes for user metadata.
   */
  userMetadataConfig?: UserMetadataConfigInterface;
  dto?: {
    createOne?: Type<RocketsAuthUserCreatableInterface>;
    updateOne?: Type<RocketsAuthUserUpdatableInterface>;
  };
  /**
   * Optional custom signup command handler.
   * Must extend AbstractSignupUserHandler.
   * Overrides the default SignupUserHandler business logic
   * while keeping all HTTP routing, swagger, and validation intact.
   */
  /**
   * Optional custom admin operation handlers.
   * Each must extend the corresponding abstract base class.
   * Overrides the default handler for List, Read, or Update
   * while keeping all HTTP routing, swagger, guards, and serialization intact.
   */
  command?: {
    signupCommand?: Type<SignupUserCommand>;
  };
  handlers?: {
    signupHandler?: Type<AbstractSignupUserHandler>;
    /** Custom admin list handler. Must extend AbstractAdminUserListHandler. */
    adminList?: Type<AbstractAdminUserListHandler>;
    /** Custom admin read handler. Must extend AbstractAdminUserReadHandler. */
    adminRead?: Type<AbstractAdminUserReadHandler>;
    /** Custom admin update CQRS handler. Must extend AbstractAdminUserUpdateHandler. */
    adminUpdate?: Type<AbstractAdminUserUpdateHandler>;
    /** Custom admin delete CQRS handler. Must extend AbstractAdminDeleteUserHandler. */
    adminDelete?: Type<AbstractAdminDeleteUserHandler>;
  };
}

export interface RoleCrudOptionsExtrasInterface {
  imports?: DynamicModule['imports'];
  path?: string;
  model: Type;
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
  /**
   * Optional `imports` / `queryServices` are forwarded to AccessControlModule.forRoot
   * so route guards can resolve domain `CanAccess` query services.
   */
  accessControl?: AccessControlOptionsInterface & {
    imports?: DynamicModule['imports'];
    queryServices?: Provider<CanAccess>[];
  };
  disableController?: DisableControllerOptionsInterface;
  invitation?: {
    imports?: DynamicModule['imports'];
  };
  /**
   * When provided, Rockets registers `RepositoryModule.forFeature` and
   * conditional `OtpModule.forFeature` internally from the given entity
   * classes. Apps no longer need to pass canonical key strings.
   */
  repositoryPersistence?: RocketsAuthRepositoryPersistenceOptions;
  /**
   * Port handler overrides for granular customization.
   * Each handler can be replaced individually without modifying core Port services.
   */
  ports?: RocketsAuthPortsConfigInterface;
}
