import { randomUUID } from 'crypto';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  InternalServerErrorException,
  Logger,
  Provider,
} from '@nestjs/common';
import { SafeCrudContextInterceptor } from '@bitwild/rockets-core';
import { PassportModule } from '@nestjs/passport';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';

import { AccessControlModule } from '@concepta/nestjs-access-control';
import {
  AuthenticationModule,
  AuthenticationOptionsInterface,
} from '@concepta/nestjs-authentication';
import { createSettingsProvider } from '@bitwild/rockets-app';
import { CrudContextOverlay, CrudModule } from '@bitwild/rockets-crud';
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
  ValidateCurrentPasswordCommand,
  ValidatePasswordHistoryCommand,
} from '@concepta/nestjs-password';
import { RepositoryModule } from '@bitwild/rockets-repository';
import { RoleModule } from '@concepta/nestjs-role';
import { SwaggerUiModule } from '@concepta/nestjs-swagger-ui';
import {
  CreateUserCommand,
  GetUserQuery,
  GetUserByEmailQuery,
  UserModule,
} from '@concepta/nestjs-user';

import { rocketsAuthOptionsDefaultConfig } from './shared/config/rockets-auth-options-default.config';
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
import { RocketsAuthPortsModule } from './shared/ports/rockets-auth-ports.module';
import { buildRocketsAuthenticationPorts } from './shared/authentication/build-rockets-authentication-ports';
import {
  RocketsAuthSetPasswordPortHandler,
  RocketsAuthValidatePasswordPortHandler,
} from './shared/authentication/rockets-auth-password-port.handlers';
import { RocketsValidateCurrentPasswordOverrideModule } from './shared/authentication/rockets-validate-current-password-override.module';
import { RocketsAuthCreateOtpPortHandler } from './shared/authentication/rockets-auth-create-otp-port.handler';
import { ConceptaRepositoryCompatModule } from './shared/compatibility/concepta-repository-compat.module';

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

  const baseModule: DynamicModule = {
    ...definition,
    global: extras.global,
    imports: createRocketsAuthImports({ imports, extras }),
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
      additionalImports.push(RocketsAuthSignUpModule.register(userCrud));
    }
    if (!disableController.invitationAcceptance) {
      additionalImports.push(
        RocketsAuthInvitationAcceptanceModule.forRoot({ userCrud }),
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
    settingsKey: rocketsAuthOptionsDefaultConfig.KEY,
    optionsOverrides,
  });
}

export function createRocketsAuthImports(importOptions: {
  imports: DynamicModule['imports'];
  extras?: RocketsAuthOptionsExtrasInterface;
}): DynamicModule['imports'] {
  const imports: DynamicModule['imports'] = [
    ...(importOptions.imports || []),
    PassportModule.register({}),

    CqrsModule.forRoot(),
    RepositoryModule.forRoot({}),
    ConceptaRepositoryCompatModule,
    RocketsAuthPortsModule.forRoot(importOptions.extras?.ports),
    ConfigModule.forFeature(rocketsAuthOptionsDefaultConfig),
    createSafeCrudRootModule(),
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
        return {
          settings: {
            ...authSettings,
            jwt: resolveJwtSettings(authSettings?.jwt),
            strategies: {
              local: {},
              jwt: {},
              refresh: {},
              ...authSettings?.strategies,
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

    RocketsValidateCurrentPasswordOverrideModule,

    UserModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      entities: {
        user: USER_CRUD_ENTITY_KEY,
        credentials: USER_CREDENTIALS_ENTITY_KEY,
      },
      imports: [...(importOptions.extras?.user?.imports || [])],
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
              validateCurrentCommand: ValidateCurrentPasswordCommand,
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

    RoleModule.forRootAsync({
      imports: [...(importOptions.extras?.role?.imports || [])],
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (rocketsServerAuthOptions: RocketsAuthOptionsInterface) => ({
        settings: {
          ...rocketsServerAuthOptions.role?.settings,
          assignments: {
            ...rocketsServerAuthOptions.role?.settings?.assignments,
            entityKey:
              rocketsServerAuthOptions.role?.settings?.assignments?.entityKey ??
              USER_ROLE_ENTITY_KEY,
          },
        },
      }),
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
    imports.push(
      AccessControlModule.forRoot({
        service: importOptions.extras.accessControl.service,
        settings: importOptions.extras.accessControl.settings,
        appFilter: importOptions.extras.accessControl.appFilter,
        // `appGuard` is forwarded from extras AS-IS (no defaulting). The
        // upstream `createAccessControlAppGuardProvider` treats `false`
        // as "no global guard" and any nullish value as "use the default
        // `AccessControlGuard` instance from DI as APP_GUARD". This is
        // load-bearing because the upstream
        // `AccessControlGuard.getQueryService` uses a STRICT
        // `moduleRef.resolve()` that only sees providers on the SAME
        // module the guard instance lives in. When the guard is wired
        // here as APP_GUARD, its host module is `AccessControlModule` —
        // the same module that receives `queryServices: [...]` — so the
        // strict resolve succeeds. Using `@UseGuards(AccessControlGuard)`
        // on a controller would instantiate the guard in the controller's
        // CrudModule scope, where queryServices are NOT registered, and
        // every request would 500 with `UnknownElementException`.
        appGuard: importOptions.extras.accessControl.appGuard,
        imports: importOptions.extras.accessControl.imports,
        queryServices: importOptions.extras.accessControl.queryServices,
      }),
    );
  }

  return imports;
}

function createSafeCrudRootModule(): DynamicModule {
  const crudRoot = CrudModule.forRootAsync({
    inject: [RAW_OPTIONS_TOKEN],
    useFactory: (options: RocketsAuthOptionsInterface) => ({
      settings: options.crud?.settings,
    }),
  }) as DynamicModule;

  const originalProviders: NonNullable<DynamicModule['providers']> =
    crudRoot.providers ?? [];
  const filteredProviders = originalProviders.filter((provider) => {
    if (
      typeof provider === 'object' &&
      provider !== null &&
      'provide' in provider
    ) {
      if (
        provider.provide === APP_INTERCEPTOR &&
        'useClass' in provider &&
        provider.useClass === CrudContextOverlay
      ) {
        return false;
      }
    }
    return true;
  });

  const originalExports: NonNullable<DynamicModule['exports']> =
    crudRoot.exports ?? [];

  return {
    ...crudRoot,
    providers: [
      ...filteredProviders,
      SafeCrudContextInterceptor,
      { provide: APP_INTERCEPTOR, useClass: SafeCrudContextInterceptor },
    ],
    exports: [...originalExports, SafeCrudContextInterceptor],
  };
}

export function createRocketsAuthExports(options: {
  exports: DynamicModule['exports'];
  extras?: RocketsAuthOptionsExtrasInterface;
}): DynamicModule['exports'] {
  return [
    ...(options.exports || []),
    ConfigModule,
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
  return [
    ...(options.providers ?? []),
    createRocketsAuthSettingsProvider(),
    RocketsAuthOtpService,
    RocketsAuthNotificationService,
    RocketsJwtAuthAdapter,
    AdminGuard,
    RocketsGetRoleByNameHandler,
    RocketsGetRolesByIdsHandler,
    ChangeMyPasswordHandler,
    RocketsAuthValidatePasswordPortHandler,
    RocketsAuthSetPasswordPortHandler,
    RocketsAuthCreateOtpPortHandler,
  ];
}
