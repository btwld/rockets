import { AccessControlOptionsInterface } from '@concepta/nestjs-access-control';
import type { CanAccess } from '@concepta/nestjs-access-control';
import type { CanActivate } from '@nestjs/common';
import type { AuthenticationOptionsExtrasInterface } from '@concepta/nestjs-authentication';
import { RocketsAuthUserMetadataCreatableInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-creatable.interface';
import { DynamicModule, Provider, Type } from '@nestjs/common';
import { RocketsAuthUserCreatableInterface } from '../../domains/user/interfaces/rockets-auth-user-creatable.interface';
import { RocketsAuthUserUpdatableInterface } from '../../domains/user/interfaces/rockets-auth-user-updatable.interface';
import { RocketsAuthRoleCreatableInterface } from '../../domains/role/interfaces/rockets-auth-role-creatable.interface';
import { RocketsAuthRoleUpdatableInterface } from '../../domains/role/interfaces/rockets-auth-role-updatable.interface';
import { RocketsAuthUserMetadataModelUpdatableInterface } from '../../domains/user/interfaces/rockets-auth-user-metadata-updatable.interface';
import { RoleExtrasInterface } from '@concepta/nestjs-role';
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
   * Used for dynamic repository registration with RepositoryModule.
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
}

export interface UserCrudOptionsExtrasInterface {
  /**
   * Module imports for user CRUD
   *
   * Must include RepositoryModule.forFeature with entity registrations:
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
  /**
   * Controller customization seams (decorators, hooks, per-route handler
   * overrides). See `domains/role/interfaces/role-controller-extras.interface.ts`
   * and `.context/v8-ddd-refactor-plan.md` §2.8.
   */
  controller?: import('../../domains/role/interfaces/role-controller-extras.interface').RoleControllerExtras;
}

/**
 * Configuration interface for disabling specific controllers.
 */
export interface DisableControllerOptionsInterface {
  /** Disable OTP controller. */
  otp?: boolean;

  /** Disable user signup controller. */
  signup?: boolean;

  /** Disable admin user management submodule. */
  admin?: boolean;

  /** Disable admin roles management submodule. */
  adminRoles?: boolean;

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

  /** Disable `/token/password` and `/token/refresh`. */
  token?: boolean;
}

export interface RocketsAuthOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  user?: { imports: DynamicModule['imports'] };
  /**
   * Auth domain extras. `controller` accepts the standard triplet
   * documented in `.context/v8-ddd-refactor-plan.md` §2.8:
   * `classDecorators`, `routes[*].decorators`. The `MePasswordController`
   * is factory-built; the `auth.controller` extras are forwarded to that
   * factory so consumers can append guards / throttling / ACL without
   * subclassing the controller.
   */
  auth?: {
    imports?: DynamicModule['imports'];
    controller?: import('../../domains/auth/interfaces/me-password-controller-extras.interface').MePasswordControllerExtras;
    /**
     * Forwarded to `AuthenticationModule.forRootAsync({ appGuard })`.
     *
     * Per upstream `AuthenticationOptionsExtrasInterface.appGuard`:
     * - `undefined` → upstream registers its default `JwtGuard` as `APP_GUARD`.
     * - `false` → no global guard; rely on `@UseGuards()` per controller.
     * - `CanActivate` instance → use this instead of the default.
     */
    appGuard?: false | CanActivate;
    /**
     * Forwarded to `AuthenticationModule.forRootAsync({ guards })` — registers
     * route-named guards for the auth-router feature (multi-strategy routing).
     *
     * Note: the implementations of these guards live in the v7 OAuth provider
     * packages (`@concepta/nestjs-auth-{google,github,apple,router}`), which
     * are blocked by upstream gap G1. Until those ship v8, the plumbing exists
     * but the feature is unusable. Safe to leave undefined.
     */
    guards?: AuthenticationOptionsExtrasInterface['guards'];
  };
  otp?: {
    imports?: DynamicModule['imports'];
    /**
     * OTP controller customization (decorators per route, hooks, etc.).
     * See `domains/otp/interfaces/otp-controller-extras.interface.ts`.
     */
    controller?: import('../../domains/otp/interfaces/otp-controller-extras.interface').OtpControllerExtras;
  };
  federated?: { imports: DynamicModule['imports'] };
  role?: RoleExtrasInterface & { imports: DynamicModule['imports'] };
  // TODO(upstream: concepta/nestjs-auth-router) — re-enable `authRouter`
  // extras when v8 OAuth providers ship; that block carried
  // `AuthRouterOptionsExtrasInterface` from the v7 nestjs-auth-router
  // package which has been removed.
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
    /**
     * Per-controller customization for the four invitation controllers
     * (`invitation`, `acceptance`, `revocation`, `reattempt`).
     * See `domains/invitation/interfaces/invitation-controller-extras.interface.ts`.
     */
    controllers?: import('../../domains/invitation/interfaces/invitation-controller-extras.interface').InvitationDomainControllerExtras;
  };
  /**
   * Port handler overrides for granular customization.
   * Each handler can be replaced individually without modifying core Port services.
   */
  ports?: RocketsAuthPortsConfigInterface;
}
