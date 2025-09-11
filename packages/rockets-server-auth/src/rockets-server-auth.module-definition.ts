import { AuthAppleGuard, AuthAppleModule } from '@concepta/nestjs-auth-apple';
import { AuthAppleOptionsInterface } from '@concepta/nestjs-auth-apple/dist/interfaces/auth-apple-options.interface';
import {
  AuthGithubGuard,
  AuthGithubModule,
} from '@concepta/nestjs-auth-github';
import { AuthGithubOptionsInterface } from '@concepta/nestjs-auth-github/dist/interfaces/auth-github-options.interface';
import {
  AuthGoogleGuard,
  AuthGoogleModule,
} from '@concepta/nestjs-auth-google';
import { AuthGoogleOptionsInterface } from '@concepta/nestjs-auth-google/dist/interfaces/auth-google-options.interface';
import { AuthJwtModule } from '@concepta/nestjs-auth-jwt';
import { AuthJwtOptionsInterface } from '@concepta/nestjs-auth-jwt/dist/interfaces/auth-jwt-options.interface';
import { AuthLocalModule } from '@concepta/nestjs-auth-local';
import { AuthLocalOptionsInterface } from '@concepta/nestjs-auth-local/dist/interfaces/auth-local-options.interface';
import { AuthRecoveryModule } from '@concepta/nestjs-auth-recovery';
import { AuthRecoveryOptionsInterface } from '@concepta/nestjs-auth-recovery/dist/interfaces/auth-recovery-options.interface';
import { AuthRefreshModule } from '@concepta/nestjs-auth-refresh';
import { AuthRefreshOptionsInterface } from '@concepta/nestjs-auth-refresh/dist/interfaces/auth-refresh-options.interface';
import {
  AuthRouterGuardConfigInterface,
  AuthRouterModule,
  AuthRouterOptionsInterface,
} from '@concepta/nestjs-auth-router';
import { AuthVerifyModule } from '@concepta/nestjs-auth-verify';
import { AuthVerifyOptionsInterface } from '@concepta/nestjs-auth-verify/dist/interfaces/auth-verify-options.interface';
import { AuthenticationModule } from '@concepta/nestjs-authentication';
import { createSettingsProvider } from '@concepta/nestjs-common';
import { CrudModule } from '@concepta/nestjs-crud';
import {
  EmailModule,
  EmailService,
  EmailServiceInterface,
} from '@concepta/nestjs-email';
import { FederatedModule } from '@concepta/nestjs-federated';
import { FederatedOptionsInterface } from '@concepta/nestjs-federated/dist/interfaces/federated-options.interface';
import { JwtModule } from '@concepta/nestjs-jwt';
import { JwtOptionsInterface } from '@concepta/nestjs-jwt/dist/interfaces/jwt-options.interface';
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
import { rocketsServerAuthOptionsDefaultConfig } from './config/rockets-server-auth-options-default.config';
import { AuthPasswordController } from './controllers/auth/auth-password.controller';
import { RocketsServerAuthRecoveryController } from './controllers/auth/auth-recovery.controller';
import { AuthTokenRefreshController } from './controllers/auth/auth-refresh.controller';
import { AuthOAuthController } from './controllers/oauth/auth-oauth.controller';
import { RocketsServerAuthOtpController } from './controllers/otp/rockets-server-auth-otp.controller';
import { AdminGuard } from './guards/admin.guard';
import { RocketsServerAuthOptionsExtrasInterface } from './interfaces/rockets-server-auth-options-extras.interface';
import { RocketsServerAuthOptionsInterface } from './interfaces/rockets-server-auth-options.interface';
import { RocketsServerAuthSettingsInterface } from './interfaces/rockets-server-auth-settings.interface';
import { RocketsServerAuthAdminModule } from './modules/admin/rockets-server-auth-admin.module';
import { RocketsServerAuthSignUpModule } from './modules/admin/rockets-server-auth-signup.module';
import { RocketsServerAuthUserModule } from './modules/admin/rockets-server-auth-user.module';
import {
  ROCKETS_SERVER_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  RocketsServerAuthUserModelService,
} from './rockets-server-auth.constants';
import { RocketsServerAuthNotificationService } from './services/rockets-server-auth-notification.service';
import { RocketsServerAuthOtpService } from './services/rockets-server-auth-otp.service';

const RAW_OPTIONS_TOKEN = Symbol('__ROCKETS_SERVER_MODULE_RAW_OPTIONS_TOKEN__');

export const {
  ConfigurableModuleClass: RocketsServerAuthModuleClass,
  OPTIONS_TYPE: ROCKETS_SERVER_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE: ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<RocketsServerAuthOptionsInterface>({
  moduleName: 'RocketsServerAuth',
  optionsInjectionToken: RAW_OPTIONS_TOKEN,
})
  .setExtras<RocketsServerAuthOptionsExtrasInterface>(
    {
      global: false,
    },
    definitionTransform,
  )
  .build();

export type RocketsServerAuthOptions = Omit<
  typeof ROCKETS_SERVER_MODULE_OPTIONS_TYPE,
  'global'
>;

export type RocketsServerAuthAsyncOptions = Omit<
  typeof ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE,
  'global'
>;

/**
 * Transform the definition to include the combined modules
 */
function definitionTransform(
  definition: DynamicModule,
  extras: RocketsServerAuthOptionsExtrasInterface,
): DynamicModule {
  const { imports = [], providers = [], exports = [] } = definition;
  const { controllers, userCrud: admin } = extras;
  // TODO: need to define this, if set it as required we need to have defaults on extras
  // if (!user?.imports) throw new Error('Make sure imports entities for user');
  // if (!otp?.imports) throw new Error('Make sure imports entities for otp');
  // Federated is optional since OAuth modules are optional
  // if (!federated?.imports) throw new Error('Make sure imports entities for federated');

  // Base module without admin
  const baseModule: DynamicModule = {
    ...definition,
    global: extras.global,
    imports: createRocketsServerAuthImports({ imports, extras }),
    controllers: createRocketsServerAuthControllers({ controllers, extras }) || [],
    providers: [...createRocketsServerAuthProviders({ providers, extras })],
    exports: createRocketsServerAuthExports({ exports, extras }),
  };

  // If admin is configured, add the admin submodule
  if (admin) {
    const disableController = extras.disableController || {};
    baseModule.imports = [
      ...(baseModule.imports || []),
      ...(!disableController.admin
        ? [RocketsServerAuthAdminModule.register(admin)]
        : []),
      ...(!disableController.signup
        ? [RocketsServerAuthSignUpModule.register(admin)]
        : []),
      ...(!disableController.user
        ? [RocketsServerAuthUserModule.register(admin)]
        : []),
    ];
  }

  return baseModule;
}

export function createRocketsServerAuthControllers(options: {
  controllers?: DynamicModule['controllers'];
  extras?: RocketsServerAuthOptionsExtrasInterface;
}): DynamicModule['controllers'] {
  return options?.controllers !== undefined
    ? options.controllers
    : (() => {
        const disableController = options?.extras?.disableController || {};
        const list: DynamicModule['controllers'] = [];

        if (!disableController.password) list.push(AuthPasswordController);
        if (!disableController.refresh) list.push(AuthTokenRefreshController);
        if (!disableController.recovery)
          list.push(RocketsServerAuthRecoveryController);
        if (!disableController.otp) list.push(RocketsServerAuthOtpController);
        if (!disableController.oAuth) list.push(AuthOAuthController);

        return list;
      })();
}

export function createRocketsServerAuthSettingsProvider(
  optionsOverrides?: RocketsServerAuthOptionsInterface,
): Provider {
  return createSettingsProvider<
    RocketsServerAuthSettingsInterface,
    RocketsServerAuthOptionsInterface
  >({
    settingsToken: ROCKETS_SERVER_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
    optionsToken: RAW_OPTIONS_TOKEN,
    settingsKey: rocketsServerAuthOptionsDefaultConfig.KEY,
    optionsOverrides,
  });
}

/**
 * Create imports for the combined module
 */
export function createRocketsServerAuthImports(options: {
  imports: DynamicModule['imports'];
  extras?: RocketsServerAuthOptionsExtrasInterface;
}): DynamicModule['imports'] {
  // Default Auth Guard Router guards configuration if not provided
  const defaultAuthRouterGuards: AuthRouterGuardConfigInterface[] = [
    { name: 'google', guard: AuthGoogleGuard },
    { name: 'github', guard: AuthGithubGuard },
    { name: 'apple', guard: AuthAppleGuard },
  ];

  const imports: DynamicModule['imports'] = [
    ...(options.imports || []),
    ConfigModule.forFeature(rocketsServerAuthOptionsDefaultConfig),
    CrudModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsServerAuthOptionsInterface) => {
        return {
          settings: options.crud?.settings,
        };
      },
    }),
    SwaggerUiModule.registerAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsServerAuthOptionsInterface) => {
        return {
          documentBuilder: options.swagger?.documentBuilder,
          settings: options.swagger?.settings,
        };
      },
    }),
    AuthenticationModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsServerAuthOptionsInterface) => {
        return {
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
        };
      },
    }),
    JwtModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
      ): JwtOptionsInterface => {
        return {
          jwtIssueTokenService:
            options.jwt?.jwtIssueTokenService ||
            options.services?.issueTokenService,
          jwtVerifyTokenService:
            options.jwt?.jwtVerifyTokenService ||
            options.services?.verifyTokenService,
          jwtRefreshService: options.jwt?.jwtRefreshService,
          jwtAccessService: options.jwt?.jwtAccessService,
          // TODO: This is only used ono apple, need to review
          jwtService: options.jwt?.jwtService,
          settings: options.jwt?.settings,
        };
      },
    }),
    AuthJwtModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
        userModelService: UserModelService,
      ): AuthJwtOptionsInterface => {
        return {
          appGuard: options.authJwt?.appGuard || false,
          verifyTokenService:
            options.authJwt?.verifyTokenService ||
            options.services?.verifyTokenService,
          userModelService:
            options.authJwt?.userModelService ||
            options.services?.userModelService ||
            userModelService,
          settings: options.authJwt?.settings,
        };
      },
    }),
    FederatedModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      imports: [...(options.extras?.federated?.imports || [])],
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
        userModelService: UserModelService,
      ): FederatedOptionsInterface => {
        return {
          userModelService:
            options.federated?.userModelService ||
            options.services?.userModelService ||
            userModelService,
          settings: options.federated?.settings,
        };
      },
    }),
    // TODO: should we have a flag to only load if defined?
    AuthAppleModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
      ): AuthAppleOptionsInterface => {
        return {
          jwtService: options.authApple?.jwtService || options.jwt?.jwtService,
          authAppleService: options.authApple?.authAppleService,
          issueTokenService:
            options.authApple?.issueTokenService ||
            options.services?.issueTokenService,
          settingsTransform: options.authApple?.settingsTransform,
          settings: options.authApple?.settings,
        };
      },
    }),
    AuthGithubModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
      ): AuthGithubOptionsInterface => {
        return {
          issueTokenService:
            options.authGithub?.issueTokenService ||
            options.services?.issueTokenService,
          settingsTransform: options.authGithub?.settingsTransform,
          settings: options.authGithub?.settings,
        };
      },
    }),
    AuthGoogleModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
      ): AuthGoogleOptionsInterface => {
        return {
          issueTokenService:
            options.authGoogle?.issueTokenService ||
            options.services?.issueTokenService,
          settingsTransform: options.authGoogle?.settingsTransform,
          settings: options.authGoogle?.settings,
        };
      },
    }),
    AuthRouterModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      guards: options.extras?.authRouter?.guards || defaultAuthRouterGuards,
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
      ): AuthRouterOptionsInterface => {
        return {
          settings: options.authRouter?.settings,
        };
      },
    }),
    AuthRefreshModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
        userModelService: UserModelService,
      ): AuthRefreshOptionsInterface => {
        return {
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
        };
      },
    }),
    AuthLocalModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
        userModelService: UserModelService,
      ): AuthLocalOptionsInterface => {
        return {
          passwordValidationService:
            options.authLocal?.passwordValidationService,
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
        };
      },
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
        options: RocketsServerAuthOptionsInterface,
        defaultEmailService: EmailService,
        defaultOtpService: OtpService,
        userModelService: UserModelService,
        defaultUserPasswordService: UserPasswordService,
      ): AuthRecoveryOptionsInterface => {
        return {
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
        };
      },
    }),
    AuthVerifyModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN, EmailService, UserModelService, OtpService],
      useFactory: (
        options: RocketsServerAuthOptionsInterface,
        defaultEmailService: EmailServiceInterface,
        userModelService: UserModelService,
        defaultOtpService: OtpService,
      ): AuthVerifyOptionsInterface => {
        return {
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
        };
      },
    }),
    PasswordModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsServerAuthOptionsInterface) => {
        return {
          settings: options.password?.settings,
        };
      },
    }),
    UserModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      imports: [...(options.extras?.user?.imports || [])],
      useFactory: (options: RocketsServerAuthOptionsInterface) => {
        return {
          settings: options.user?.settings,
          userModelService:
            options.user?.userModelService ||
            options.services?.userModelService,
          userPasswordService:
            options.user?.userPasswordService ||
            options.services?.userPasswordService,
          userAccessQueryService:
            options.user?.userAccessQueryService ||
            options.services?.userAccessQueryService,
          userPasswordHistoryService:
            options.user?.userPasswordHistoryService ||
            options.services?.userPasswordHistoryService,
        };
      },
    }),
    OtpModule.forRootAsync({
      imports: [...(options.extras?.otp?.imports || [])],
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsServerAuthOptionsInterface) => {
        return {
          settings: options.otp?.settings,
        };
      },
      entities: ['userOtp'],
    }),
    EmailModule.forRootAsync({
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (options: RocketsServerAuthOptionsInterface) => {
        return {
          settings: options.email?.settings,
          mailerService:
            options.email?.mailerService || options.services.mailerService,
        };
      },
    }),
    RoleModule.forRootAsync({
      imports: [...(options.extras?.role?.imports || [])],
      inject: [RAW_OPTIONS_TOKEN],
      useFactory: (rocketsServerAuthOptions: RocketsServerAuthOptionsInterface) => ({
        roleModelService: rocketsServerAuthOptions.role?.roleModelService,
        settings: {
          ...rocketsServerAuthOptions.role?.settings,
          assignments: {
            user: { entityKey: 'userRole' },
            ...rocketsServerAuthOptions.role?.settings?.assignments,
          },
        },
      }),
      entities: ['userRole', ...(options.extras?.role?.entities || [])],
    }),
  ];

  return imports;
}

/**
 * Create exports for the combined module
 */
export function createRocketsServerAuthExports(options: {
  exports: DynamicModule['exports'];
  extras?: RocketsServerAuthOptionsExtrasInterface;
}): DynamicModule['exports'] {
  return [
    ...(options.exports || []),
    ConfigModule,
    RAW_OPTIONS_TOKEN,
    ROCKETS_SERVER_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
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
  ];
}

/**
 * Create providers for the combined module
 */
export function createRocketsServerAuthProviders(options: {
  providers?: Provider[];
  extras?: RocketsServerAuthOptionsExtrasInterface;
}): Provider[] {
  return [
    ...(options.providers ?? []),
    createRocketsServerAuthSettingsProvider(),
    {
      provide: RocketsServerAuthUserModelService,
      inject: [RAW_OPTIONS_TOKEN, UserModelService],
      useFactory: async (
        options: RocketsServerAuthOptionsInterface,
        userModelService: UserModelService,
      ) => {
        return options.services.userModelService || userModelService;
      },
    },
    RocketsServerAuthOtpService,
    RocketsServerAuthNotificationService,
    AdminGuard,
  ];
}
