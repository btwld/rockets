import type {
  AccessControlOptionsInterface,
  CanAccess,
} from '@concepta/nestjs-access-control';
import type {
  CanActivate,
  DynamicModule,
  Provider,
  Type,
} from '@nestjs/common';
import type { AuthenticationOptionsExtrasInterface } from '@concepta/nestjs-authentication';
import type { RoleExtrasInterface } from '@concepta/nestjs-role';
import type { z } from 'zod';
import type { RocketsAuthPortsConfigInterface } from './rockets-auth-ports-config.interface';
import type {
  AbstractSignupUserHandler,
  SignupUserCommand,
} from '../../domains/user';
import type { AbstractAdminUserListHandler } from '../../domains/user/application/commands/handlers/abstract-admin-user-list.handler';
import type { AbstractAdminUserReadHandler } from '../../domains/user/application/commands/handlers/abstract-admin-user-read.handler';
import type { AbstractAdminUserUpdateHandler } from '../../domains/user/application/commands/handlers/abstract-admin-user-update.handler';
import type { AbstractAdminDeleteUserHandler } from '../../domains/user/application/commands/handlers/abstract-admin-delete-user.handler';
import type { RocketsAuthThrottlingOptions } from './rockets-auth-throttling-options.interface';

/**
 * User-metadata wiring for the auth package — the same contract core's
 * `RocketsUserMetadataConfig` carries: the entity for the dynamic
 * repository plus the named zod schemas (`withOpenApi(schema, id)` as the
 * LAST call) that validate a `userMetadata` patch and project the stored
 * row onto the wire.
 */
export interface UserMetadataConfigInterface {
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
  /** Shape of a `userMetadata` patch (signup, admin update, invitation acceptance, `/me`). */
  updateSchema: z.ZodType;
  /** Wire projection of the stored row (nested under `user.userMetadata`). */
  responseSchema: z.ZodType;
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
  /**
   * Named response schema for `/signup` and `/admin/users`. Defaults to
   * `rocketsAuthUserSchema(userMetadataConfig.responseSchema)`.
   */
  model?: z.ZodType;
  entity?: Type;
  userMetadataConfig?: UserMetadataConfigInterface;
  /** Named request schemas; default to the `rocketsAuthUser*Schema` builders. */
  dto?: {
    createOne?: z.ZodType;
    updateOne?: z.ZodType;
  };
  /** Optional signup command constructor. */
  command?: {
    signupCommand?: Type<SignupUserCommand>;
  };
  /** Optional signup and admin CQRS handler overrides. */
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
  /** Named response schema for `/admin/roles` (e.g. `rocketsAuthRoleSchema`). */
  model: z.ZodType;
  /** Named request schemas; default to `rocketsAuthRoleCreateSchema` / `rocketsAuthRoleUpdateSchema`. */
  dto?: {
    createOne?: z.ZodType;
    updateOne?: z.ZodType;
  };
  /** Controller decorators and per-route handler overrides. */
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

  /** Disable account-recovery routes under `/recovery`. */
  recovery?: boolean;
}

export interface RocketsAuthOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  user?: { imports: DynamicModule['imports'] };
  /** Auth module imports, guards, and password-controller decorators. */
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
     * Compatible implementations are not yet available from the upstream
     * OAuth provider packages, so leave this undefined unless the host supplies
     * its own guards.
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
   * Optional `imports` / `queryServices` are forwarded to AccessControlModule.forRoot
   * so route guards can resolve domain `CanAccess` query services.
   */
  accessControl?: AccessControlOptionsInterface & {
    imports?: DynamicModule['imports'];
    queryServices?: Provider<CanAccess>[];
  };
  disableController?: DisableControllerOptionsInterface;
  /**
   * Request-throttling configuration for the rate limiter that guards
   * Rockets Auth's own public routes (signup, login, recovery, otp,
   * invitation acceptance) — core's `RateLimitGuard` over two named
   * dimensions (`ip` ceiling + per-`(ip, account)` fine limits; see
   * {@link RocketsAuthThrottlingOptions}). Rockets Auth scopes the guard
   * to those controllers — it does not register an app-wide `APP_GUARD`.
   * Pass `false` to disable Rockets Auth's throttling entirely (e.g. the
   * host enforces its own limits upstream).
   */
  throttling?: false | RocketsAuthThrottlingOptions;
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
