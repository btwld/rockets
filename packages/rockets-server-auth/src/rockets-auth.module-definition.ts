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
import { OtpModule, OtpService } from '@concepta/nestjs-otp';
import { PasswordModule } from '@concepta/nestjs-password';
import { RoleModule } from '@concepta/nestjs-role';
import { SwaggerUiModule } from '@concepta/nestjs-swagger-ui';
import {
  UserModelService,
  UserModule,
  UserPasswordService,
} from '@concepta/nestjs-user';
import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Provider,
} from '@nestjs/common';
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

/**
 * Transform the definition to include the combined modules
 */
function definitionTransform(
  definition: DynamicModule,
  extras: RocketsAuthOptionsExtrasInterface,
): DynamicModule {
  const { imports = [], providers = [], exports = [] } = definition;
  const { controllers, userCrud, roleCrud } = extras;
  // TODO: need to define this, if set it as required we need to have defaults on extras
  // if (!user?.imports) throw new Error('Make sure imports entities for user');
  // if (!otp?.imports) throw new Error('Make sure imports entities for otp');
  // Federated is optional since OAuth modules are optional
  // if (!federated?.imports) throw new Error('Make sure imports entities for federated');

  // Base module without admin
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
  if (options?.controllers !== undefined) {
    return options.controllers;
  }

  const disableController = options?.extras?.disableController || {};
  const list: DynamicModule['controllers'] = [];

  if (!disableController.password) list.push(AuthPasswordController);
  if (!disableController.refresh) list.push(AuthTokenRefreshController);
  if (!disableController.recovery) list.push(RocketsAuthRecoveryController);
  if (!disableController.otp) list.push(RocketsAuthOtpController);
  if (!disableController.oAuth) list.push(AuthOAuthController);
  if (!disableController.invitation) list.push(InvitationController);
  // InvitationAcceptanceController is registered by RocketsAuthInvitationAcceptanceModule
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

/**
 * Create imports for the combined module
 */
export function createRocketsAuthImports(importOptions: {
  imports: DynamicModule['imports'];
  extras?: RocketsAuthOptionsExtrasInterface;
}): DynamicModule['imports'] {
  // Default Auth Guard Router guards configuration if not provided
  const defaultAuthRouterGuards: AuthRouterGuardConfigInterface[] = [
    { name: 'google', guard: AuthGoogleGuard },
    { name: 'github', guard: AuthGithubGuard },
    { name: 'apple', guard: AuthAppleGuard },
  ];

  const imports: DynamicModule['imports'] = [
    ...(importOptions.imports || []),
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
        // TODO: This is only used on apple, need to review
        jwtService: options.jwt?.jwtService,
        settings: options.jwt?.settings,
      }),
    }),
    AuthJwtModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: UserModelService,
      ): AuthJwtOptionsInterface => ({
        appGuard:
          importOptions.extras?.enableGlobalJWTGuard === true
            ? undefined
            : false,
        verifyTokenService:
          options.authJwt?.verifyTokenService ||
          options.services?.verifyTokenService,
        userModelService:
          options.authJwt?.userModelService ||
          options.services?.userModelService ||
          userModelService,
        settings: options.authJwt?.settings,
      }),
    }),
    FederatedModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      imports: [...(importOptions.extras?.federated?.imports || [])],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: UserModelService,
      ): FederatedOptionsInterface => ({
        userModelService:
          options.federated?.userModelService ||
          options.services?.userModelService ||
          userModelService,
        settings: options.federated?.settings,
      }),
    }),
    // TODO: should we have a flag to only load if defined?
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
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: UserModelService,
      ): AuthRefreshOptionsInterface => ({
        verifyTokenService:
          options.refresh?.verifyTokenService ||
          options.services?.verifyTokenService,
        issueTokenService:
          options.refresh?.issueTokenService ||
          options.services?.issueTokenService,
        userModelService:
          options.refresh?.userModelService ||
          options.services?.userModelService ||
          userModelService,
        settings: options.refresh?.settings,
      }),
    }),
    AuthLocalModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: UserModelService,
      ): AuthLocalOptionsInterface => ({
        passwordValidationService: options.authLocal?.passwordValidationService,
        validateUserService:
          options.authLocal?.validateUserService ||
          options.services?.validateUserService,
        issueTokenService:
          options.authLocal?.issueTokenService ||
          options.services?.issueTokenService,
        userModelService:
          options.authLocal?.userModelService ||
          options.services?.userModelService ||
          userModelService,
        settings: options.authLocal?.settings,
      }),
    }),
    AuthRecoveryModule.forRootAsync({
      inject: [
        RAW_OPTIONS_TOKEN,
        EmailService,
        OtpService,
        UserModelService,
        UserPasswordService,
      ],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        defaultEmailService: EmailService,
        defaultOtpService: OtpService,
        userModelService: UserModelService,
        defaultUserPasswordService: UserPasswordService,
      ): AuthRecoveryOptionsInterface => ({
        // TODO: keep this one using default and user mailer service to define how to send
        emailService: defaultEmailService,
        otpService: defaultOtpService,
        userModelService:
          options.authRecovery?.userModelService ||
          options.services?.userModelService ||
          userModelService,
        userPasswordService:
          options.authRecovery?.userPasswordService ||
          options.services?.userPasswordService ||
          defaultUserPasswordService,
        notificationService:
          options.authRecovery?.notificationService ||
          options.services?.notificationService,
        settings: options.authRecovery?.settings,
      }),
    }),
    AuthVerifyModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, EmailService, UserModelService, OtpService],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        defaultEmailService: EmailServiceInterface,
        userModelService: UserModelService,
        defaultOtpService: OtpService,
      ): AuthVerifyOptionsInterface => ({
        emailService: defaultEmailService,
        otpService: defaultOtpService,
        userModelService:
          options.authVerify?.userModelService ||
          options.services?.userModelService ||
          userModelService,
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
      imports: [...(importOptions.extras?.user?.imports || [])],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        settings: options.user?.settings,
        userModelService:
          options.user?.userModelService || options.services?.userModelService,
        userPasswordService:
          options.user?.userPasswordService ||
          options.services?.userPasswordService,
        userAccessQueryService:
          options.user?.userAccessQueryService ||
          options.services?.userAccessQueryService,
        userPasswordHistoryService:
          options.user?.userPasswordHistoryService ||
          options.services?.userPasswordHistoryService,
      }),
    }),
    OtpModule.forRootAsync({
      imports: [...(importOptions.extras?.otp?.imports || [])],
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsAuthOptionsInterface) => ({
        settings: options.otp?.settings,
      }),
      entities: ['userOtp'],
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
        roleModelService: rocketsServerAuthOptions.role?.roleModelService,
        settings: {
          ...rocketsServerAuthOptions.role?.settings,
          assignments: {
            user: { entityKey: 'userRole' },
            ...rocketsServerAuthOptions.role?.settings?.assignments,
          },
        },
      }),
      entities: ['userRole', ...(importOptions.extras?.role?.entities || [])],
    }),
    InvitationModule.forRootAsync({
      imports: [...(importOptions.extras?.invitation?.imports || [])],
      inject: [RAW_OPTIONS_TOKEN, UserModelService, OtpService, EmailService],
      useFactory: (
        options: RocketsAuthOptionsInterface,
        userModelService: UserModelService,
        defaultOtpService: OtpService,
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
          userModelService:
            options.invitation?.userModelService ||
            options.services?.userModelService ||
            userModelService,
          otpService: defaultOtpService,
          emailService: defaultEmailService,
        };
      },
    }),
  ];

  // Conditionally register AccessControlModule if configuration provided
  if (importOptions.extras?.accessControl) {
    imports.push(
      AccessControlModule.forRoot({
        service: importOptions.extras.accessControl.service,
        settings: importOptions.extras.accessControl.settings,
        appFilter: importOptions.extras.accessControl.appFilter,
        appGuard: false,
      }),
    );
  }

  return imports;
}

/**
 * Create exports for the combined module
 */
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
  ];
}

/**
 * Create providers for the combined module
 */
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
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      useFactory: async (
        options: RocketsAuthOptionsInterface,
        userModelService: UserModelService,
      ) => {
        return options.services.userModelService || userModelService;
      },
    },
    RocketsAuthOtpService,
    RocketsAuthNotificationService,
    RocketsJwtAuthProvider,
    AdminGuard,
    RocketsAuthRoleService,
  ];

  return providers;
}
