import { AccessControlModule } from '@concepta/nestjs-access-control';
import {
  AuthAppleGuard,
  AuthAppleModule,
  AuthAppleOptionsInterface,
} from '@concepta/nestjs-auth-apple';
import {
  AuthGithubGuard,
  AuthGithubModule,
  AuthGithubOptionsInterface,
} from '@concepta/nestjs-auth-github';
import {
  AuthGoogleGuard,
  AuthGoogleModule,
  AuthGoogleOptionsInterface,
} from '@concepta/nestjs-auth-google';
import {
  AuthJwtModule,
  AuthJwtOptionsInterface,
} from '@concepta/nestjs-auth-jwt';
import {
  AuthLocalModule,
  AuthLocalOptionsInterface,
} from '@concepta/nestjs-auth-local';
import {
  AuthRecoveryModule,
  AuthRecoveryOptionsInterface,
} from '@concepta/nestjs-auth-recovery';
import {
  AuthRefreshModule,
  AuthRefreshOptionsInterface,
} from '@concepta/nestjs-auth-refresh';
import {
  AuthRouterGuardConfigInterface,
  AuthRouterModule,
  AuthRouterOptionsInterface,
} from '@concepta/nestjs-auth-router';
import {
  AuthVerifyModule,
  AuthVerifyOptionsInterface,
} from '@concepta/nestjs-auth-verify';
import { AuthenticationModule } from '@concepta/nestjs-authentication';
import { createSettingsProvider } from '@concepta/nestjs-common';
import { CrudModule } from '@concepta/nestjs-crud';
import {
  EmailModule,
  EmailService,
  EmailServiceInterface,
} from '@concepta/nestjs-email';
import { FederatedModule } from '@concepta/nestjs-federated';
import { InvitationModule } from '@concepta/nestjs-invitation';
import { JwtModule, JwtOptionsInterface } from '@concepta/nestjs-jwt';
import { OtpModule } from '@concepta/nestjs-otp';
import { PasswordModule } from '@concepta/nestjs-password';
import { RoleModule } from '@concepta/nestjs-role';
import { SwaggerUiModule } from '@concepta/nestjs-swagger-ui';
import { UserModule } from '@concepta/nestjs-user';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ConfigModule } from '@nestjs/config';
import { rocketsAuthOptionsDefaultConfig } from './shared/config/rockets-auth-options-default.config';
import { AuthPasswordController } from './domains/auth/controllers/auth-password.controller';
import { MePasswordController } from './domains/auth/controllers/me-password.controller';
import { RocketsAuthRecoveryController } from './domains/auth/controllers/auth-recovery.controller';
import { AuthTokenRefreshController } from './domains/auth/controllers/auth-refresh.controller';
import { AuthOAuthController } from './domains/oauth/controllers/auth-oauth.controller';
import { RocketsAuthOtpController } from './domains/otp/controllers/rockets-auth-otp.controller';
import { AdminGuard } from './guards/admin.guard';
import { RocketsAuthOptionsExtrasInterface } from './shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthOptionsInterface } from './shared/interfaces/rockets-auth-options.interface';
import { RocketsAuthSettingsInterface } from './shared/interfaces/rockets-auth-settings.interface';
import { RocketsAuthAdminModule } from './domains/user/modules/rockets-auth-admin.module';
import { RocketsAuthSignUpModule } from './domains/user/modules/rockets-auth-signup.module';
import { RocketsAuthRoleAdminModule } from './domains/role/modules/rockets-auth-role-admin.module';
import { RocketsAuthRoleService } from './domains/role/services/rockets-auth-role.service';
import { RocketsGetRoleByNameHandler } from './domains/role/application/queries/handlers/rockets-get-role-by-name.handler';
import { RocketsGetRolesByIdsHandler } from './domains/role/application/queries/handlers/rockets-get-roles-by-ids.handler';

import {
  ROLE_CRUD_ENTITY_KEY,
  USER_CREDENTIALS_ENTITY_KEY,
  USER_CRUD_ENTITY_KEY,
  USER_METADATA_MODULE_ENTITY_KEY,
  USER_OTP_ENTITY_KEY,
  USER_ROLE_ENTITY_KEY,
} from './shared/constants/repository-entity-keys.constants';
import type {
  RocketsAuthRepositoryPersistenceEntities,
  RocketsAuthRepositoryPersistenceOptions,
} from './shared/interfaces/rockets-auth-repository-persistence.interface';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  ROCKETS_AUTH_OTP_ASSIGNMENT,
  RocketsAuthUserModelService,
} from './shared/constants/rockets-auth.constants';
import { RocketsAuthNotificationService } from './domains/otp/services/rockets-auth-notification.service';
import { RocketsAuthOtpService } from './domains/otp/services/rockets-auth-otp.service';
import { RocketsJwtAuthProvider } from './provider/rockets-jwt-auth.provider';
import {
  InvitationController,
  InvitationRevocationController,
  InvitationReattemptController,
} from './domains/invitation';
import { RocketsAuthInvitationAcceptanceModule } from './domains/invitation/modules/rockets-auth-invitation-acceptance.module';
import { RocketsAuthUserMetadataModule } from './domains/user/modules/rockets-auth-user-metadata.module';
import { UserCrudOptionsExtrasInterface } from './shared/interfaces/rockets-auth-options-extras.interface';
import {
  FederatedOptionsInterface,
  InvitationOptionsInterface,
  InvitationSettingsInterface,
} from './shared/compat/concepta-internals';
import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
  ROCKETS_AUTH_USER_PASSWORD_PORT_TOKEN,
} from './shared/ports/rockets-auth-user-port.service';
import {
  RocketsAuthOtpPortService,
  ROCKETS_AUTH_OTP_PORT_TOKEN,
} from './shared/ports/rockets-auth-otp-port.service';
import { RocketsAuthPortsModule } from './shared/ports/rockets-auth-ports.module';
import {
  RepositoryModule,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import type { FederatedUserModelServiceInterface } from '@concepta/nestjs-federated/dist/interfaces/federated-user-model-service.interface';
import type { AuthLocalUserModelServiceInterface } from '@concepta/nestjs-auth-local/dist/interfaces/auth-local-user-model-service.interface';
import type { AuthRecoveryUserModelServiceInterface } from '@concepta/nestjs-auth-recovery/dist/interfaces/auth-recovery-user-model.service.interface';
import type { AuthVerifyUserModelServiceInterface } from '@concepta/nestjs-auth-verify/dist/interfaces/auth-verify-user-model.service.interface';
import type { InvitationUserModelServiceInterface } from '@concepta/nestjs-invitation/dist/interfaces/services/invitation-user-model.service.interface';
import type { InvitationOtpServiceInterface } from '@concepta/nestjs-invitation/dist/interfaces/services/invitation-otp-service.interface';
import type { AuthRecoveryOtpServiceInterface } from '@concepta/nestjs-auth-recovery/dist/interfaces/auth-recovery-otp.service.interface';
import type { AuthVerifyOtpServiceInterface } from '@concepta/nestjs-auth-verify/dist/interfaces/auth-verify-otp.service.interface';

export const RAW_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_SERVER_MODULE_RAW_OPTIONS_TOKEN__',
);

export const {
  ConfigurableModuleClass: RocketsAuthModuleClass,
  OPTIONS_TYPE: ROCKETS_SERVER_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<RocketsAuthOptionsInterface>({
  moduleName: 'RocketsAuth',
  optionsInjectionToken: RAW_OPTIONS_TOKEN,
})
  .setExtras<RocketsAuthOptionsExtrasInterface>(
    {
      global: false,
    },
    definitionTransform,
  )
  .build();

export type RocketsAuthOptions = Omit<
  typeof ROCKETS_SERVER_MODULE_OPTIONS_TYPE,
  'global'
>;

export type RocketsAuthAsyncOptions = Omit<
  typeof ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE,
  'global'
>;

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
    providers: [...createRocketsAuthProviders({ providers, extras, userCrud })],
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
  if (options.controllers !== undefined) {
    return options.controllers;
  }

  const disableController = options.extras?.disableController || {};
  const list: DynamicModule['controllers'] = [];

  if (!disableController.password) list.push(AuthPasswordController);
  if (!disableController.refresh) list.push(AuthTokenRefreshController);
  if (!disableController.recovery) list.push(RocketsAuthRecoveryController);
  if (!disableController.otp) list.push(RocketsAuthOtpController);
  if (!disableController.oAuth) list.push(AuthOAuthController);
  if (!disableController.invitation) list.push(InvitationController);
  if (!disableController.invitationRevocation)
    list.push(InvitationRevocationController);
  if (!disableController.invitationReattempt)
    list.push(InvitationReattemptController);
  if (!disableController.mePassword) list.push(MePasswordController);

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
  const defaultAuthRouterGuards: AuthRouterGuardConfigInterface[] = [
    { name: 'google', guard: AuthGoogleGuard },
    { name: 'github', guard: AuthGithubGuard },
    { name: 'apple', guard: AuthAppleGuard },
  ];

  const persistenceImports = createRepositoryPersistenceImports(
    importOptions.extras?.repositoryPersistence,
  );

  const imports: DynamicModule['imports'] = [
    ...(importOptions.imports || []),
    ...(persistenceImports || []),
    CqrsModule.forRoot(),
    RepositoryModule.forRoot({}),
    RocketsAuthPortsModule.forRoot(importOptions.extras?.ports),
    ConfigModule.forFeature(rocketsAuthOptionsDefaultConfig),
    CrudModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        settings: options.crud?.settings,
      }),
    }),
    SwaggerUiModule.registerAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        documentBuilder: options.swagger?.documentBuilder,
        settings: options.swagger?.settings,
      }),
    }),
    AuthenticationModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        verifyTokenService:
          options.authentication?.verifyTokenService ||
          options.services?.verifyTokenService,
        issueTokenService:
          options.authentication?.issueTokenService ||
          options.services?.issueTokenService,
        validateTokenService:
          options.authentication?.validateTokenService ||
          options.services?.validateTokenService,
        settings: options.authentication?.settings,
      }),
    }),
    JwtModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsAuthOptionsInterface,
      ): JwtOptionsInterface => ({
        jwtIssueTokenService:
          options.jwt?.jwtIssueTokenService ||
          options.services?.issueTokenService,
        jwtVerifyTokenService:
          options.jwt?.jwtVerifyTokenService ||
          options.services?.verifyTokenService,
        jwtRefreshService: options.jwt?.jwtRefreshService,
        jwtAccessService: options.jwt?.jwtAccessService,
        jwtService: options.jwt?.jwtService,
        settings: options.jwt?.settings,
      }),
    }),
    AuthJwtModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, ROCKETS_AUTH_USER_PORT_TOKEN],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: RocketsAuthUserPortService,
      ): AuthJwtOptionsInterface => ({
        appGuard:
          importOptions.extras?.enableGlobalJWTGuard === true
            ? undefined
            : false,
        verifyTokenService:
          options.authJwt?.verifyTokenService ||
          options.services?.verifyTokenService,
        userModelService: options.authJwt?.userModelService || userModelService,
        settings: options.authJwt?.settings,
      }),
    }),
    FederatedModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, ROCKETS_AUTH_USER_PORT_TOKEN],
      imports: [...(importOptions.extras?.federated?.imports || [])],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: RocketsAuthUserPortService,
      ): FederatedOptionsInterface => ({
        userModelService: (options.federated?.userModelService ||
          userModelService) as FederatedUserModelServiceInterface,
        settings: options.federated?.settings,
      }),
    }),
    AuthAppleModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsAuthOptionsInterface,
      ): AuthAppleOptionsInterface => ({
        jwtService: options.authApple?.jwtService || options.jwt?.jwtService,
        authAppleService: options.authApple?.authAppleService,
        issueTokenService:
          options.authApple?.issueTokenService ||
          options.services?.issueTokenService,
        settingsTransform: options.authApple?.settingsTransform,
        settings: options.authApple?.settings,
      }),
    }),
    AuthGithubModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsAuthOptionsInterface,
      ): AuthGithubOptionsInterface => ({
        issueTokenService:
          options.authGithub?.issueTokenService ||
          options.services?.issueTokenService,
        settingsTransform: options.authGithub?.settingsTransform,
        settings: options.authGithub?.settings,
      }),
    }),
    AuthGoogleModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsAuthOptionsInterface,
      ): AuthGoogleOptionsInterface => ({
        issueTokenService:
          options.authGoogle?.issueTokenService ||
          options.services?.issueTokenService,
        settingsTransform: options.authGoogle?.settingsTransform,
        settings: options.authGoogle?.settings,
      }),
    }),
    AuthRouterModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      guards:
        importOptions.extras?.authRouter?.guards || defaultAuthRouterGuards,
      useFactory: (
        options: RocketsAuthOptionsInterface,
      ): AuthRouterOptionsInterface => ({
        settings: options.authRouter?.settings,
      }),
    }),
    AuthRefreshModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, ROCKETS_AUTH_USER_PORT_TOKEN],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: RocketsAuthUserPortService,
      ): AuthRefreshOptionsInterface => ({
        verifyTokenService:
          options.refresh?.verifyTokenService ||
          options.services?.verifyTokenService,
        issueTokenService:
          options.refresh?.issueTokenService ||
          options.services?.issueTokenService,
        userModelService: options.refresh?.userModelService || userModelService,
        settings: options.refresh?.settings,
      }),
    }),
    AuthLocalModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, ROCKETS_AUTH_USER_PORT_TOKEN],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: RocketsAuthUserPortService,
      ): AuthLocalOptionsInterface => ({
        passwordValidationService: options.authLocal?.passwordValidationService,
        validateUserService:
          options.authLocal?.validateUserService ||
          options.services?.validateUserService,
        issueTokenService:
          options.authLocal?.issueTokenService ||
          options.services?.issueTokenService,
        userModelService: (options.authLocal?.userModelService ||
          userModelService) as AuthLocalUserModelServiceInterface,
        settings: options.authLocal?.settings,
      }),
    }),
    AuthRecoveryModule.forRootAsync({
      inject: [
        RAW_OPTIONS_TOKEN,
        EmailService,
        ROCKETS_AUTH_OTP_PORT_TOKEN,
        ROCKETS_AUTH_USER_PORT_TOKEN,
        ROCKETS_AUTH_USER_PASSWORD_PORT_TOKEN,
      ],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        defaultEmailService: EmailService,
        defaultOtpService: RocketsAuthOtpPortService,
        userModelService: RocketsAuthUserPortService,
        defaultUserPasswordService: AuthRecoveryOptionsInterface['userPasswordService'],
      ): AuthRecoveryOptionsInterface => ({
        emailService: defaultEmailService,
        otpService: defaultOtpService as AuthRecoveryOtpServiceInterface,
        userModelService: (options.authRecovery?.userModelService ||
          userModelService) as AuthRecoveryUserModelServiceInterface,
        userPasswordService:
          options.authRecovery?.userPasswordService ||
          defaultUserPasswordService,
        notificationService:
          options.authRecovery?.notificationService ||
          options.services?.notificationService,
        settings: options.authRecovery?.settings,
      }),
    }),
    AuthVerifyModule.forRootAsync({
      inject: [
        RAW_OPTIONS_TOKEN,
        EmailService,
        ROCKETS_AUTH_USER_PORT_TOKEN,
        ROCKETS_AUTH_OTP_PORT_TOKEN,
      ],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        defaultEmailService: EmailServiceInterface,
        userModelService: RocketsAuthUserPortService,
        defaultOtpService: RocketsAuthOtpPortService,
      ): AuthVerifyOptionsInterface => ({
        emailService: defaultEmailService,
        otpService: defaultOtpService as AuthVerifyOtpServiceInterface,
        userModelService: (options.authVerify?.userModelService ||
          userModelService) as AuthVerifyUserModelServiceInterface,
        notificationService:
          options.authVerify?.notificationService ||
          options.services?.notificationService,
        settings: options.authVerify?.settings,
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
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        settings: options.user?.settings,
      }),
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
            user: { entityKey: USER_ROLE_ENTITY_KEY },
            ...rocketsServerAuthOptions.role?.settings?.assignments,
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
      inject: [
        RAW_OPTIONS_TOKEN,
        ROCKETS_AUTH_USER_PORT_TOKEN,
        ROCKETS_AUTH_OTP_PORT_TOKEN,
        EmailService,
      ],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: RocketsAuthUserPortService,
        defaultOtpService: RocketsAuthOtpPortService,
        defaultEmailService: EmailService,
      ): InvitationOptionsInterface => {
        const invitationSettings: InvitationSettingsInterface = {
          email: {
            baseUrl:
              options.invitation?.settings?.email?.baseUrl ||
              options.settings.email.baseUrl,
            from:
              options.invitation?.settings?.email?.from ||
              options.settings.email.from,
            templates: {
              invitation:
                options.invitation?.settings?.email?.templates?.invitation ||
                options.settings.email.templates.invitation,
              invitationAccepted:
                options.invitation?.settings?.email?.templates
                  ?.invitationAccepted ||
                options.settings.email.templates.invitationAccepted,
            },
          },
          otp: {
            ...options.settings.otp,
            assignment: ROCKETS_AUTH_OTP_ASSIGNMENT,
          },
        };
        return {
          settings: invitationSettings,
          userModelService: (options.invitation?.userModelService ||
            userModelService) as InvitationUserModelServiceInterface,
          otpService: defaultOtpService as InvitationOtpServiceInterface,
          emailService: defaultEmailService,
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
        appGuard: false,
        imports: importOptions.extras.accessControl.imports,
        queryServices: importOptions.extras.accessControl.queryServices,
      }),
    );
  }

  return imports;
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
    JwtModule,
    AuthJwtModule,
    AuthAppleModule,
    AuthGithubModule,
    AuthGoogleModule,
    AuthRouterModule,
    AuthRefreshModule,
    FederatedModule,
    SwaggerUiModule,
    RoleModule,
    AdminGuard,
    RocketsJwtAuthProvider,
    RocketsAuthRoleService,
    // ROCKETS_AUTH_USER_PORT_TOKEN — provided globally via RocketsAuthPortsModule
  ];
}

export function createRocketsAuthProviders(options: {
  providers?: Provider[];
  extras?: RocketsAuthOptionsExtrasInterface;
  userCrud?: UserCrudOptionsExtrasInterface;
}): Provider[] {
  const providers: Provider[] = [
    ...(options.providers ?? []),
    createRocketsAuthSettingsProvider(),
    {
      provide: RocketsAuthUserModelService,
      useExisting: ROCKETS_AUTH_USER_PORT_TOKEN,
    },
    RocketsAuthOtpService,
    RocketsAuthNotificationService,
    RocketsJwtAuthProvider,
    AdminGuard,
    RocketsAuthRoleService,
    RocketsGetRoleByNameHandler,
    RocketsGetRolesByIdsHandler,
  ];

  return providers;
}

const PERSISTENCE_ENTITY_KEY_MAP: Record<
  keyof Required<RocketsAuthRepositoryPersistenceEntities>,
  string
> = {
  user: USER_CRUD_ENTITY_KEY,
  userCredentials: USER_CREDENTIALS_ENTITY_KEY,
  userMetadata: USER_METADATA_MODULE_ENTITY_KEY,
  userOtp: USER_OTP_ENTITY_KEY,
  role: ROLE_CRUD_ENTITY_KEY,
  userRole: USER_ROLE_ENTITY_KEY,
};

export function createRepositoryPersistenceImports(
  config: RocketsAuthRepositoryPersistenceOptions | undefined,
): DynamicModule['imports'] {
  if (config === undefined) return [];

  const { module: repositoryAdapterModule, entities } = config;
  const rows: RepositoryProviderOptions[] = [];

  for (const prop of Object.keys(
    PERSISTENCE_ENTITY_KEY_MAP,
  ) as (keyof RocketsAuthRepositoryPersistenceEntities)[]) {
    const entityClass = entities[prop];
    if (entityClass !== undefined) {
      rows.push({
        key: PERSISTENCE_ENTITY_KEY_MAP[prop],
        entity: entityClass,
      });
    }
  }

  const imports: DynamicModule['imports'] = [
    RepositoryModule.forFeature({
      module: repositoryAdapterModule,
      entities: rows,
    }),
  ];

  if (entities.userOtp !== undefined) {
    imports.push(OtpModule.forFeature([USER_OTP_ENTITY_KEY]));
  }

  return imports;
}
