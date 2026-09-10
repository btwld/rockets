import { randomUUID } from 'crypto';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  InternalServerErrorException,
  Logger,
  Provider,
} from '@nestjs/common';
import {
  buildAccessControlImport,
  SwaggerUiModule,
} from '@concepta/rockets-core';
import { PassportModule } from '@nestjs/passport';
import { CommandBus, CqrsModule, QueryBus } from '@nestjs/cqrs';
import {
  AuthenticationModule,
  AuthenticationOptionsInterface,
  OtpPort,
  PasswordPort,
  RecoveryPolicy,
  RecoveryPolicySettingsInterface,
  RecoveryService,
  UserPort,
} from '@concepta/nestjs-authentication';
import { createSettingsProvider } from '@concepta/nestjs-core';
import { CrudModule } from '@concepta/nestjs-crud';
import { EmailModule } from '@concepta/nestjs-email';
import {
  FederatedModule,
  FederatedOptionsInterface,
} from '@concepta/nestjs-federated';
import {
  InvitationModule,
  InvitationOptionsInterface,
  InvitationSettingsInterface,
} from '@concepta/nestjs-invitation';
import {
  SendInvitationEmailCommand,
  SendAcceptedEmailCommand,
} from './domains/invitation/application/commands/impl/send-invitation-email.command';
import {
  ConsumeOtpCommand,
  ClearOtpsCommand,
  CreateOtpCommand,
  ValidateOtpQuery,
  OtpModule,
} from '@concepta/nestjs-otp';
import {
  CreatePasswordCommand,
  PasswordModule,
  ValidatePasswordHistoryCommand,
} from '@concepta/nestjs-password';
import {
  RepositoryModule,
  TransactionScope,
} from '@concepta/nestjs-repository';
import { RoleModule, RoleOptionsInterface } from '@concepta/nestjs-role';
import {
  CreateUserCommand,
  GetUserQuery,
  GetUserByEmailQuery,
  UserModule,
} from '@concepta/nestjs-user';

import {
  ROCKETS_AUTH_SETTINGS_DEFAULTS_TOKEN,
  rocketsAuthOptionsDefaultConfig,
} from './shared/config/rockets-auth-options-default.config';
import { RAW_OPTIONS_TOKEN } from './shared/constants/rockets-auth-raw-options.token';
import { buildMePasswordController } from './domains/auth/gateways/http/factories/build-me-password-controller';
import { RocketsAuthTokenController } from './domains/auth/gateways/http/controllers/rockets-auth-token.controller';
import { ChangeMyPasswordHandler } from './domains/auth/application/commands/handlers/change-my-password.handler';
import { buildRocketsAuthOtpController } from './domains/otp/gateways/http/factories/build-rockets-auth-otp-controller';
import { AdminGuard } from './guards/admin.guard';
import { RocketsAuthOptionsExtrasInterface } from './shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthOptionsInterface } from './shared/interfaces/rockets-auth-options.interface';
import { RocketsAuthSettingsInterface } from './shared/interfaces/rockets-auth-settings.interface';
import { RocketsAuthAdminModule } from './domains/user/modules/rockets-auth-admin.module';
import { RocketsAuthSignUpModule } from './domains/user/modules/rockets-auth-signup.module';
import { RocketsAuthRoleAdminModule } from './domains/role/modules/rockets-auth-role-admin.module';
import { RocketsGetRoleByNameHandler } from './domains/role/application/queries/handlers/rockets-get-role-by-name.handler';
import { RocketsGetRolesByIdsHandler } from './domains/role/application/queries/handlers/rockets-get-roles-by-ids.handler';
import {
  ROLE_CRUD_ENTITY_KEY,
  USER_CREDENTIALS_ENTITY_KEY,
  USER_CRUD_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from './shared/constants/repository-entity-keys.constants';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  ROCKETS_AUTH_OTP_ASSIGNMENT,
} from './shared/constants/rockets-auth.constants';
import { RocketsAuthNotificationService } from './domains/otp/infrastructure/services/rockets-auth-notification.service';
import { RocketsAuthOtpService } from './domains/otp/infrastructure/services/rockets-auth-otp.service';
import { RocketsJwtAuthAdapter } from './provider/rockets-jwt-auth.adapter';
import {
  buildInvitationController,
  buildInvitationRevocationController,
  buildInvitationReattemptController,
} from './domains/invitation';
import { RocketsAuthInvitationAcceptanceModule } from './domains/invitation/modules/rockets-auth-invitation-acceptance.module';
import { RocketsAuthUserMetadataModule } from './domains/user/modules/rockets-auth-user-metadata.module';
import { RocketsAuthRateLimitModule } from './shared/throttling/rockets-auth-rate-limit.module';
import { RocketsAuthPortsModule } from './shared/ports/rockets-auth-ports.module';
import { buildRocketsAuthenticationPorts } from './shared/authentication/build-rockets-authentication-ports';
import {
  RocketsAuthSetPasswordPortHandler,
  RocketsAuthValidatePasswordPortHandler,
} from './shared/authentication/rockets-auth-password-port.handlers';
import {
  RocketsValidateCurrentPasswordCommand,
  RocketsValidateCurrentPasswordHandler,
} from './shared/authentication/rockets-validate-current-password.handler';
import { RocketsAuthCreateOtpPortHandler } from './shared/authentication/rockets-auth-create-otp-port.handler';
import { RocketsAuthRecoveryController } from './domains/auth/gateways/http/controllers/rockets-auth-recovery.controller';
import { RocketsRecoveryService } from './domains/auth/application/services/rockets-recovery.service';

export { RAW_OPTIONS_TOKEN } from './shared/constants/rockets-auth-raw-options.token';

export const {
  ConfigurableModuleClass: RocketsAuthModuleClass,
  OPTIONS_TYPE: ROCKETS_AUTH_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: ROCKETS_AUTH_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<RocketsAuthOptionsInterface>({
  moduleName: 'RocketsAuth',
  optionsInjectionToken: RAW_OPTIONS_TOKEN,
})
  .setExtras<RocketsAuthOptionsExtrasInterface>(
    { global: false },
    definitionTransform,
  )
  .build();

export type RocketsAuthOptions = Omit<
  typeof ROCKETS_AUTH_MODULE_OPTIONS_TYPE,
  'global'
>;
export type RocketsAuthAsyncOptions = Omit<
  typeof ROCKETS_AUTH_MODULE_ASYNC_OPTIONS_TYPE,
  'global'
>;

/**
 * Recovery OTP policy applied when the consumer does not supply
 * `authentication.settings.mfa.recovery`.
 *
 * Single-sourced deliberately: `AuthenticationModule` builds its own
 * `RecoveryPolicy` from the settings factory while
 * {@link createRocketsAuthProviders} builds a second one for
 * {@link RocketsRecoveryService} (upstream does not export `RecoveryPolicy`).
 * The two must agree — a divergent namespace or category means issued passcodes
 * stop validating.
 */
const ROCKETS_DEFAULT_RECOVERY_SETTINGS: RecoveryPolicySettingsInterface = {
  otp: {
    namespace: ROCKETS_AUTH_OTP_ASSIGNMENT,
    category: 'auth-recovery',
    type: 'uuid',
    expiresIn: '1h',
    duplicateStrategy: 'DEACTIVATE',
    rateSeconds: 60,
    rateThreshold: 5,
  },
};

const jwtLogger = new Logger('RocketsAuthJwt');

/**
 * Resolves the JWT secret for a given role (access / refresh):
 * 1. Consumer-supplied `settings.jwt.<role>.secret` wins.
 * 2. Otherwise fall back to `process.env[<envVar>]`.
 * 3. If neither is set and `NODE_ENV === 'production'`, throw — never
 *    sign with a guessable secret in prod.
 * 4. Outside production, emit a one-time random UUID per process and warn.
 *    Tokens minted under this fallback do not survive a restart, which is
 *    the desired property for local/dev/test.
 */
function resolveJwtSecret(
  role: 'access' | 'refresh',
  configured: string | undefined,
  envVar: 'JWT_MODULE_ACCESS_SECRET' | 'JWT_MODULE_REFRESH_SECRET',
): string {
  const fromEnv = process.env[envVar];
  if (configured) return configured;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new InternalServerErrorException(
      `JWT ${role} secret is not configured. Set ` +
        `\`authentication.settings.jwt.${role}.secret\` or the ${envVar} ` +
        `environment variable.`,
    );
  }
  jwtLogger.warn(
    `No JWT ${role} secret configured; generating an ephemeral random ` +
      `secret for this process (NODE_ENV is not "production"). Tokens will ` +
      `become invalid on restart. Set ${envVar} for a stable dev secret.`,
  );
  return randomUUID();
}

type JwtSettingsShape = NonNullable<
  AuthenticationOptionsInterface['settings']
>['jwt'];

const passwordSecurityLogger = new Logger('RocketsAuthPassword');

/**
 * Detects the dangerous `password.requireCurrent: false` override:
 *   - In production: fail fast at boot. Allowing password rotation without
 *     proving the current password turns any stolen session token into a
 *     full account takeover.
 *   - Outside production: emit a one-time warning so the consumer can see
 *     the choice in logs (legitimate only for SSO-without-password or
 *     deliberate recovery flows).
 */
function warnOrThrowOnRequireCurrentOverride(
  consumerPassword: { requireCurrent?: boolean } | undefined,
): void {
  if (consumerPassword?.requireCurrent !== false) return;
  const detail =
    'user.settings.password.requireCurrent is set to false. This lets a ' +
    'caller change a user password without supplying the current one — any ' +
    'stolen access token can rotate the password (session takeover -> ' +
    'permanent account takeover). Only acceptable for SSO-without-password ' +
    'or explicit recovery flows.';
  if (process.env.NODE_ENV === 'production') {
    throw new InternalServerErrorException(detail);
  }
  passwordSecurityLogger.warn(detail);
}

function resolveJwtSettings(consumer: JwtSettingsShape): JwtSettingsShape {
  const accessSecret = resolveJwtSecret(
    'access',
    consumer?.access?.secret as string | undefined,
    'JWT_MODULE_ACCESS_SECRET',
  );
  const refreshSecret = resolveJwtSecret(
    'refresh',
    consumer?.refresh?.secret as string | undefined,
    'JWT_MODULE_REFRESH_SECRET',
  );
  return {
    ...consumer,
    access: {
      signOptions: { expiresIn: '1h' },
      ...consumer?.access,
      secret: accessSecret,
    },
    refresh: {
      signOptions: { expiresIn: '7d' },
      ...consumer?.refresh,
      secret: refreshSecret,
    },
  };
}

function definitionTransform(
  definition: DynamicModule,
  extras: RocketsAuthOptionsExtrasInterface,
): DynamicModule {
  const { imports = [], providers = [], exports = [] } = definition;
  const { controllers, userCrud, roleCrud } = extras;

  // Built ONCE and shared. A controller's guard resolves its
  // dependencies from the injector of the module that DECLARES the
  // controller, so a sub-module declaring a rate-limited controller of
  // its own has to import THIS registration — otherwise it reads
  // `RATE_LIMIT_STORE_TOKEN` off the global registry, where an app that
  // also registers a store globally wins by being registered first.
  // Importing the same dynamic-module object is how Nest is told it is
  // one registration and not two.
  const rateLimitModule = RocketsAuthRateLimitModule.forRoot(extras.throttling);

  const baseModule: DynamicModule = {
    ...definition,
    global: extras.global,
    imports: createRocketsAuthImports({ imports, extras, rateLimitModule }),
    controllers: createRocketsAuthControllers({ controllers, extras }),
    providers: createRocketsAuthProviders({ providers, extras }),
    exports: createRocketsAuthExports({ exports, extras }),
  };

  const disableController = extras.disableController || {};

  if (userCrud) {
    const additionalImports: DynamicModule['imports'] = [];
    if (userCrud.userMetadataConfig) {
      additionalImports.push(
        RocketsAuthUserMetadataModule.forRoot(userCrud.userMetadataConfig),
      );
    }
    if (!disableController.admin) {
      additionalImports.push(RocketsAuthAdminModule.register(userCrud));
    }
    if (!disableController.signup) {
      // NOT given `rateLimitModule`: the signup controller is generated by
      // `CrudModule.forFeature`, which declares it in a module of its own
      // and accepts neither `imports` nor `providers` — so its guard can
      // only resolve `RATE_LIMIT_STORE_TOKEN` from the global registry.
      // Handing the registration to `RocketsAuthSignUpModule` would look
      // like a fix and change nothing. See CONFIGURATION.md §7b.
      additionalImports.push(RocketsAuthSignUpModule.register(userCrud));
    }
    if (!disableController.invitationAcceptance) {
      additionalImports.push(
        RocketsAuthInvitationAcceptanceModule.forRoot({
          userCrud,
          imports: [rateLimitModule],
        }),
      );
    }
    baseModule.imports = [...(baseModule.imports ?? []), ...additionalImports];
  }

  if (roleCrud && !disableController.adminRoles) {
    baseModule.imports = [
      ...(baseModule.imports ?? []),
      RocketsAuthRoleAdminModule.register(roleCrud),
    ];
  }

  return baseModule;
}

export function createRocketsAuthControllers(options: {
  controllers?: DynamicModule['controllers'];
  extras?: RocketsAuthOptionsExtrasInterface;
}): DynamicModule['controllers'] {
  if (options.controllers !== undefined) return options.controllers;

  const disableController = options.extras?.disableController || {};
  const list: DynamicModule['controllers'] = [];

  // Authentication strategies and CQRS handlers come from v8
  // `AuthenticationModule`; HTTP routes for `/token/password` and
  // `/token/refresh` are composed in {@link RocketsAuthTokenController}.
  if (!disableController.token) list.push(RocketsAuthTokenController);
  if (!disableController.recovery) list.push(RocketsAuthRecoveryController);
  if (!disableController.otp) {
    list.push(buildRocketsAuthOtpController(options.extras?.otp?.controller));
  }
  const invitationExtras = options.extras?.invitation?.controllers;
  if (!disableController.invitation) {
    list.push(buildInvitationController(invitationExtras?.invitation));
  }
  if (!disableController.invitationRevocation) {
    list.push(
      buildInvitationRevocationController(invitationExtras?.revocation),
    );
  }
  if (!disableController.invitationReattempt) {
    list.push(buildInvitationReattemptController(invitationExtras?.reattempt));
  }
  if (!disableController.mePassword) {
    list.push(buildMePasswordController(options.extras?.auth?.controller));
  }

  // TODO(upstream: concepta/nestjs-auth-apple|github|google) — re-add
  // AuthOAuthController here when v8 OAuth providers ship.

  return list;
}

export function createRocketsAuthSettingsProvider(
  optionsOverrides?: RocketsAuthOptionsInterface,
): Provider {
  return createSettingsProvider<
    RocketsAuthSettingsInterface,
    RocketsAuthOptionsInterface
  >({
    settingsToken: ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
    optionsToken: RAW_OPTIONS_TOKEN,
    settingsKey: ROCKETS_AUTH_SETTINGS_DEFAULTS_TOKEN,
    optionsOverrides,
  });
}

export function createRocketsAuthImports(importOptions: {
  imports: DynamicModule['imports'];
  extras?: RocketsAuthOptionsExtrasInterface;
  /**
   * The one `RocketsAuthRateLimitModule` registration for this app. The
   * SAME instance is handed to the sub-modules that declare a
   * rate-limited controller of their own, so their guards resolve this
   * registration's store rather than whichever global one happens to win
   * (see {@link buildRateLimitModule}).
   */
  rateLimitModule: DynamicModule;
}): DynamicModule['imports'] {
  const { rateLimitModule } = importOptions;
  const imports: DynamicModule['imports'] = [
    ...(importOptions.imports || []),
    PassportModule.register({}),

    CqrsModule.forRoot(),
    RepositoryModule.forRoot({}),
    RocketsAuthPortsModule.forRoot(importOptions.extras?.ports),
    CrudModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        settings: options.crud?.settings,
      }),
    }),
    // Always imported: the auth controllers reference `RateLimitGuard`
    // statically, so its providers must resolve even when throttling is
    // off (`throttling: false` disables the guard, not the wiring).
    rateLimitModule,
    SwaggerUiModule.registerAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        documentBuilder: options.swagger?.documentBuilder,
        settings: options.swagger?.settings,
      }),
    }),

    // Single v8 authentication module replaces the seven v7 packages
    // (auth-jwt, auth-local, auth-refresh, auth-recovery, auth-verify,
    // auth-router, plus standalone nestjs-jwt). The `ports` block points
    // at upstream CQRS Command/Query CLASSES — the consumer's CQRS
    // handlers do the actual work via CommandBus/QueryBus dispatch.
    //
    // `appGuard` and `guards` are forwarded from `extras.auth` (NOT
    // `options.authentication`) because they live in the upstream
    // `AuthenticationOptionsExtrasInterface`, which is resolved at
    // module-init time alongside `definitionTransform` — not by the
    // async useFactory.
    AuthenticationModule.forRootAsync({
      imports: [RocketsAuthPortsModule],
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsAuthOptionsInterface,
      ): AuthenticationOptionsInterface => {
        const authSettings = options.authentication?.settings;
        const strategies = authSettings?.strategies;
        return {
          settings: {
            ...authSettings,
            jwt: resolveJwtSettings(authSettings?.jwt),
            mfa: {
              ...authSettings?.mfa,
              // Mounting the recovery controller implies that the upstream
              // RecoveryService must be active, so the policy is never absent.
              recovery:
                authSettings?.mfa?.recovery ??
                ROCKETS_DEFAULT_RECOVERY_SETTINGS,
            },
            strategies: {
              ...strategies,
              // Optional properties can be present with an explicit
              // `undefined`; normalize after the spread so they cannot erase
              // Rockets' default-on strategies (including the JWT APP_GUARD).
              local: strategies?.local ?? {},
              jwt: strategies?.jwt ?? {},
              refresh: strategies?.refresh ?? {},
            },
          },
          ports: buildRocketsAuthenticationPorts(options),
        };
      },
      ...(importOptions.extras?.auth?.appGuard !== undefined
        ? { appGuard: importOptions.extras.auth.appGuard }
        : {}),
      ...(importOptions.extras?.auth?.guards !== undefined
        ? { guards: importOptions.extras.auth.guards }
        : {}),
    }),

    FederatedModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      imports: [...(importOptions.extras?.federated?.imports ?? [])],
      useFactory: (
        options: RocketsAuthOptionsInterface,
      ): FederatedOptionsInterface => ({
        userPort: {
          getByIdQuery: GetUserQuery,
          getByEmailQuery: GetUserByEmailQuery,
          createCommand: CreateUserCommand,
          ...options.federated?.userPort,
        },
        settings: options.federated?.settings,
      }),
    }),

    PasswordModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        settings: options.password?.settings,
      }),
    }),

    UserModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      entities: {
        user: USER_CRUD_ENTITY_KEY,
        credentials: USER_CREDENTIALS_ENTITY_KEY,
      },
      imports: [...(importOptions.extras?.user?.imports || [])],
      providers: [RocketsAuthSetPasswordPortHandler],
      useFactory: (options: RocketsAuthOptionsInterface) => {
        const userSettings = options.user?.settings;
        warnOrThrowOnRequireCurrentOverride(userSettings?.password);
        return {
          settings: {
            ...userSettings,
            password: {
              /** Security default; callers may set `requireCurrent: false`. */
              requireCurrent: true,
              ...userSettings?.password,
            },
          },
          ports: {
            password: {
              createCommand: CreatePasswordCommand,
              validateCurrentCommand: RocketsValidateCurrentPasswordCommand,
              // Default-on: prevents silent password reuse. Without this,
              // `UserPasswordPort.validateHistory()` no-ops and returns
              // true for every reused password — even when the consumer
              // configures `user.settings.password.reuseAfterDays`.
              validateHistoryCommand: ValidatePasswordHistoryCommand,
              ...options.user?.ports?.password,
            },
          },
        };
      },
    }),

    OtpModule.forRootAsync({
      imports: [...(importOptions.extras?.otp?.imports || [])],
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        settings: options.otp?.settings,
      }),
    }),

    EmailModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        settings: options.email?.settings,
        mailerService:
          options.email?.mailerService || options.services.mailerService,
      }),
    }),

    // Entity keys are declared on `RoleModule.forFeature` below; upstream's
    // root options carry nothing else, so the consumer's `role` block is
    // forwarded verbatim.
    RoleModule.forRootAsync({
      imports: [...(importOptions.extras?.role?.imports || [])],
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        rocketsServerAuthOptions: RocketsAuthOptionsInterface,
      ): RoleOptionsInterface => ({ ...rocketsServerAuthOptions.role }),
    }),
    RoleModule.forFeature({
      roleEntityKey: ROLE_CRUD_ENTITY_KEY,
      assignmentEntityKeys: [USER_ROLE_ENTITY_KEY],
    }),

    InvitationModule.forRootAsync({
      imports: [...(importOptions.extras?.invitation?.imports || [])],
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsAuthOptionsInterface,
      ): InvitationOptionsInterface => {
        // v8 InvitationSettingsInterface only carries `otp`. The `email`
        // (baseUrl/from/templates) settings are now resolved inside the
        // notification handler from `RocketsAuthSettingsInterface.email`.
        const invitationSettings: InvitationSettingsInterface = {
          ...options.invitation?.settings,
          otp: {
            namespace: ROCKETS_AUTH_OTP_ASSIGNMENT,
            type: options.settings.otp.type,
            expiresIn: options.settings.otp.expiresIn,
            ...options.invitation?.settings?.otp,
          },
        };
        return {
          settings: invitationSettings,
          ports: {
            user: {
              getByIdQuery: GetUserQuery,
              getByEmailQuery: GetUserByEmailQuery,
              ...options.invitation?.ports?.user,
            },
            otp: {
              createCommand: CreateOtpCommand,
              consumeCommand: ConsumeOtpCommand,
              clearCommand: ClearOtpsCommand,
              validateQuery: ValidateOtpQuery,
              ...options.invitation?.ports?.otp,
            },
            notification: {
              sendInvitationCommand: SendInvitationEmailCommand,
              sendAcceptedCommand: SendAcceptedEmailCommand,
              ...options.invitation?.ports?.notification,
            },
          },
        };
      },
    }),
  ];

  if (importOptions.extras?.accessControl) {
    imports.push(buildAccessControlImport(importOptions.extras.accessControl));
  }

  return imports;
}

export function createRocketsAuthExports(options: {
  exports: DynamicModule['exports'];
  extras?: RocketsAuthOptionsExtrasInterface;
}): DynamicModule['exports'] {
  return [
    ...(options.exports || []),
    RAW_OPTIONS_TOKEN,
    ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
    AuthenticationModule,
    FederatedModule,
    SwaggerUiModule,
    RoleModule,
    AdminGuard,
    RocketsJwtAuthAdapter,
    // ROCKETS_AUTH_USER_PORT_TOKEN — provided globally via RocketsAuthPortsModule
  ];
}

export function createRocketsAuthProviders(options: {
  providers?: Provider[];
  extras?: RocketsAuthOptionsExtrasInterface;
}): Provider[] {
  const providers: Provider[] = [
    ...(options.providers ?? []),
    rocketsAuthOptionsDefaultConfig,
    createRocketsAuthSettingsProvider(),
    RocketsAuthOtpService,
    RocketsAuthNotificationService,
    RocketsJwtAuthAdapter,
    AdminGuard,
    RocketsGetRoleByNameHandler,
    RocketsGetRolesByIdsHandler,
    ChangeMyPasswordHandler,
    RocketsAuthValidatePasswordPortHandler,
    RocketsAuthCreateOtpPortHandler,
    RocketsValidateCurrentPasswordHandler,
    {
      provide: RecoveryService,
      inject: [RAW_OPTIONS_TOKEN, CommandBus, QueryBus, TransactionScope],
      useFactory: (
        authOptions: RocketsAuthOptionsInterface,
        commandBus: CommandBus,
        queryBus: QueryBus,
        txScope: TransactionScope,
      ) => {
        const ports = buildRocketsAuthenticationPorts(authOptions);
        // Must resolve to the same policy the settings factory above hands to
        // AuthenticationModule.
        const recoverySettings =
          authOptions.authentication?.settings?.mfa?.recovery ??
          ROCKETS_DEFAULT_RECOVERY_SETTINGS;
        return new RocketsRecoveryService(
          new RecoveryPolicy(recoverySettings),
          new OtpPort(ports.otp, commandBus, queryBus),
          new UserPort(ports.user, queryBus, commandBus),
          new PasswordPort(ports.password, commandBus),
          ports.recoveryNotification,
          commandBus,
          txScope,
        );
      },
    },
  ];

  return providers;
}
