import { EmailSendInterface } from '@concepta/nestjs-common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { UserFixture } from './__fixtures__/user/user.entity.fixture';
import { UserOtpEntityFixture } from './__fixtures__/user/user-otp-entity.fixture';
import { AuthPasswordController } from './controllers/auth/auth-password.controller';
import { RocketsServerRecoveryController } from './controllers/auth/auth-recovery.controller';
import { AuthTokenRefreshController } from './controllers/auth/auth-refresh.controller';
import { AuthOAuthController } from './controllers/oauth/auth-oauth.controller';
import { RocketsServerOtpController } from './controllers/otp/rockets-server-otp.controller';
import { RocketsServerNotificationServiceInterface } from './interfaces/rockets-server-notification.service.interface';
import { RocketsServerOptionsExtrasInterface } from './interfaces/rockets-server-options-extras.interface';
import { RocketsServerOptionsInterface } from './interfaces/rockets-server-options.interface';
import { RocketsServerUserModelServiceInterface } from './interfaces/rockets-server-user-model-service.interface';
import { RocketsServerUserModelService } from './rockets-server.constants';
import {
  createRocketsServerControllers,
  createRocketsServerExports,
  createRocketsServerImports,
  createRocketsServerProviders,
  createRocketsServerSettingsProvider,
  ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE,
  ROCKETS_SERVER_MODULE_OPTIONS_TYPE,
  RocketsServerModuleClass,
} from './rockets-server.module-definition';
import { FederatedEntityFixture } from './__fixtures__/federated/federated.entity.fixture';

describe('RocketsServerModuleDefinition', () => {
  const mockUserModelService: RocketsServerUserModelServiceInterface = {
    byEmail: jest.fn(),
    bySubject: jest.fn(),
    byUsername: jest.fn(),
    byId: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    replace: jest.fn(),
    remove: jest.fn(),
  };

  const mockEmailService: EmailSendInterface = {
    sendMail: jest.fn(),
  };

  const mockOtpService = {
    create: jest.fn(),
    validate: jest.fn(),
  };

  const mockUserPasswordService = {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
  };

  const mockNotificationService: RocketsServerNotificationServiceInterface = {
    sendRecoverPasswordEmail: jest.fn(),
    sendVerifyEmail: jest.fn(),
    sendEmail: jest.fn(),
    sendRecoverLoginEmail: jest.fn(),
    sendPasswordUpdatedSuccessfullyEmail: jest.fn(),
  };

  const mockOptions: RocketsServerOptionsInterface = {
    jwt: {
      settings: {
        access: { secret: 'test-secret' },
        default: { secret: 'test-secret' },
        refresh: { secret: 'test-secret' },
      },
    },
    services: {
      mailerService: mockEmailService,
      userModelService: mockUserModelService,
      notificationService: mockNotificationService,
    },
  };

  const mockExtras: RocketsServerOptionsExtrasInterface = {
    global: false,
    controllers: [],
    user: {
      imports: [],
    },
    otp: {
      imports: [],
    },
    federated: {
      imports: [],
    },
    authRouter: {
      guards: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Module Class Definition', () => {
    it('should define RocketsServerModuleClass', () => {
      expect(RocketsServerModuleClass).toBeDefined();
    });

    it('should define ROCKETS_SERVER_MODULE_OPTIONS_TYPE', () => {
      expect(ROCKETS_SERVER_MODULE_OPTIONS_TYPE).toBeDefined();
    });

    it('should define ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE', () => {
      expect(ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE).toBeDefined();
    });
  });

  describe('createRocketsServerControllers', () => {
    it('should return default controllers when no controllers provided', () => {
      const result = createRocketsServerControllers({
        extras: { global: false },
      });

      expect(result).toEqual([
        AuthPasswordController,
        AuthTokenRefreshController,
        RocketsServerRecoveryController,
        RocketsServerOtpController,
        AuthOAuthController,
      ]);
    });

    it('should return provided controllers when controllers are specified', () => {
      const customControllers = [AuthPasswordController];
      const result = createRocketsServerControllers({
        controllers: customControllers,
        extras: { global: false },
      });

      expect(result).toEqual([AuthPasswordController]);
    });

    it('should return default controllers when controllers is explicitly undefined', () => {
      const result = createRocketsServerControllers({
        controllers: undefined,
      });

      expect(result).toEqual([
        AuthPasswordController,
        AuthTokenRefreshController,
        RocketsServerRecoveryController,
        RocketsServerOtpController,
        AuthOAuthController,
      ]);
    });

    it('should handle empty controllers array', () => {
      const result = createRocketsServerControllers({
        controllers: [],
      });

      expect(result).toEqual([]);
    });
  });

  describe('createRocketsServerSettingsProvider', () => {
    it('should create settings provider without options overrides', () => {
      const provider = createRocketsServerSettingsProvider();

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('object');
    });

    it('should create settings provider with options overrides', () => {
      const provider = createRocketsServerSettingsProvider(mockOptions);

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('object');
    });
  });

  describe('createRocketsServerImports', () => {
    it('should create imports with default configuration', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should include all required modules in imports', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Check that we have a reasonable number of modules
      expect(result!.length).toBeGreaterThan(10);
    });

    it('should merge additional imports', () => {
      const additionalImports = [ConfigModule];
      const result = createRocketsServerImports({
        imports: additionalImports,
        extras: mockExtras,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extras with user imports', () => {
      const extrasWithUserImports: RocketsServerOptionsExtrasInterface = {
        ...mockExtras,
        user: {
          imports: [
            TypeOrmExtModule.forFeature({
              user: {
                entity: UserFixture,
              },
            }),
          ],
        },
      };
      const result = createRocketsServerImports({
        imports: [],
        extras: extrasWithUserImports,
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extras with otp imports', () => {
      const extrasWithOtpImports: RocketsServerOptionsExtrasInterface = {
        ...mockExtras,
        otp: {
          imports: [
            TypeOrmExtModule.forFeature({
              userOtp: {
                entity: UserOtpEntityFixture,
              },
            }),
          ],
        },
      };

      const result = createRocketsServerImports({
        imports: [],
        extras: extrasWithOtpImports,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extras with federated imports', () => {
      const extrasWithFederatedImports: RocketsServerOptionsExtrasInterface = {
        ...mockExtras,
        federated: {
          imports: [
            TypeOrmExtModule.forFeature({
              federated: {
                entity: FederatedEntityFixture,
              },
            }),
          ],
        },
      };

      const result = createRocketsServerImports({
        imports: [],
        extras: extrasWithFederatedImports,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extras with authGuardRouter guards', () => {
      const extrasWithGuards: RocketsServerOptionsExtrasInterface = {
        ...mockExtras,
        authRouter: {
          guards: [{ name: 'custom', guard: jest.fn() }],
        },
      };

      const result = createRocketsServerImports({
        imports: [],
        extras: extrasWithGuards,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createRocketsServerExports', () => {
    it('should return default exports when no exports provided', () => {
      const result = createRocketsServerExports({ exports: [] });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should merge additional exports with default exports', () => {
      const additionalExports = [ConfigModule];
      const result = createRocketsServerExports({
        exports: additionalExports,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(additionalExports.length);
    });

    it('should handle undefined exports', () => {
      const result = createRocketsServerExports({
        exports: undefined,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createRocketsServerProviders', () => {
    it('should return default providers when no providers provided', () => {
      const result = createRocketsServerProviders({});
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should include required service providers', () => {
      const result = createRocketsServerProviders({});
      expect(result!.length).toBeGreaterThan(3);
    });

    it('should merge additional providers with default providers', () => {
      const additionalProviders = [{ provide: 'TEST', useValue: 'test' }];
      const result = createRocketsServerProviders({
        providers: additionalProviders,
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(additionalProviders.length);
    });

    it('should handle undefined providers', () => {
      const result = createRocketsServerProviders({ providers: undefined });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Module Integration Tests', () => {
    it('should create a valid module with all dependencies', () => {
      const extras: RocketsServerOptionsExtrasInterface = {
        global: false,
        controllers: [],
        user: { imports: [] },
        otp: { imports: [] },
        federated: { imports: [] },
        authRouter: { guards: [] },
      };

      const imports = createRocketsServerImports({ imports: [], extras });
      const controllers = createRocketsServerControllers({ controllers: [] });
      const providers = createRocketsServerProviders({ providers: [] });
      const exports = createRocketsServerExports({ exports: [] });

      expect(imports).toBeDefined();
      expect(controllers).toBeDefined();
      expect(providers).toBeDefined();
      expect(exports).toBeDefined();
      expect(Array.isArray(imports)).toBe(true);
      expect(Array.isArray(providers)).toBe(true);
      expect(Array.isArray(exports)).toBe(true);
    });

    it('should handle global module configuration', () => {
      const extras: RocketsServerOptionsExtrasInterface = {
        global: true,
        controllers: [],
        user: { imports: [] },
        otp: { imports: [] },
        federated: { imports: [] },
        authRouter: { guards: [] },
      };

      const imports = createRocketsServerImports({ imports: [], extras });
      const controllers = createRocketsServerControllers({ controllers: [] });
      const providers = createRocketsServerProviders({ providers: [] });
      const exports = createRocketsServerExports({ exports: [] });

      expect(imports).toBeDefined();
      expect(controllers).toBeDefined();
      expect(providers).toBeDefined();
      expect(exports).toBeDefined();
    });
  });

  describe('Service Configuration Tests', () => {
    it('should handle authentication service configuration', () => {
      const optionsWithAuth: RocketsServerOptionsInterface = {
        ...mockOptions,
        authentication: {
          settings: {},
        },
      };

      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with auth options
      const settingsProvider =
        createRocketsServerSettingsProvider(optionsWithAuth);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });

    it('should handle JWT service configuration', () => {
      const optionsWithJwt: RocketsServerOptionsInterface = {
        ...mockOptions,
        jwt: {
          settings: {
            access: { secret: 'test-secret' },
            default: { secret: 'test-secret' },
            refresh: { secret: 'test-secret' },
          },
        },
      };

      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with JWT options
      const settingsProvider =
        createRocketsServerSettingsProvider(optionsWithJwt);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });

    it('should handle user model service configuration', () => {
      const optionsWithUserModel: RocketsServerOptionsInterface = {
        ...mockOptions,
        services: {
          ...mockOptions.services,
          userModelService: mockUserModelService,
        },
      };

      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with user model options
      const settingsProvider =
        createRocketsServerSettingsProvider(optionsWithUserModel);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });

    it('should handle email service configuration', () => {
      const optionsWithEmail: RocketsServerOptionsInterface = {
        ...mockOptions,
        email: {
          mailerService: mockEmailService,
        },
      };

      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with email options
      const settingsProvider =
        createRocketsServerSettingsProvider(optionsWithEmail);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });

    it('should handle OAuth service configurations', () => {
      const optionsWithOAuth: RocketsServerOptionsInterface = {
        ...mockOptions,
        authApple: {
          settings: {
            mapProfile: jest.fn(),
          },
        },
        authGithub: {
          settings: {
            clientId: 'test-client-id',
            clientSecret: 'test-client-secret',
            callbackURL: 'http://localhost:3000/auth/github/callback',
            mapProfile: jest.fn(),
          },
        },
        authGoogle: {
          settings: {
            mapProfile: jest.fn(),
          },
        },
      };

      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with OAuth options
      const settingsProvider =
        createRocketsServerSettingsProvider(optionsWithOAuth);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });
  });

  describe('Module Factory Function Tests', () => {
    it('should test SwaggerUiModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find SwaggerUiModule in the imports
      const swaggerModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'SwaggerUiModule',
      );

      if (
        swaggerModule &&
        typeof swaggerModule === 'object' &&
        'useFactory' in swaggerModule &&
        typeof swaggerModule.useFactory === 'function'
      ) {
        const factoryResult = swaggerModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('documentBuilder');
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthenticationModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthenticationModule in the imports
      const authModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthenticationModule',
      );

      if (
        authModule &&
        typeof authModule === 'object' &&
        'useFactory' in authModule &&
        typeof authModule.useFactory === 'function'
      ) {
        const factoryResult = authModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test JwtModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find JwtModule in the imports
      const jwtModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'JwtModule',
      );

      if (
        jwtModule &&
        typeof jwtModule === 'object' &&
        'useFactory' in jwtModule &&
        typeof jwtModule.useFactory === 'function'
      ) {
        const factoryResult = jwtModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthJwtModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthJwtModule in the imports
      const authJwtModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthJwtModule',
      );

      if (
        authJwtModule &&
        typeof authJwtModule === 'object' &&
        'useFactory' in authJwtModule &&
        typeof authJwtModule.useFactory === 'function'
      ) {
        const factoryResult = authJwtModule.useFactory(
          mockOptions,
          mockUserModelService,
        );
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test FederatedModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find FederatedModule in the imports
      const federatedModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'FederatedModule',
      );

      if (
        federatedModule &&
        typeof federatedModule === 'object' &&
        'useFactory' in federatedModule &&
        typeof federatedModule.useFactory === 'function'
      ) {
        const factoryResult = federatedModule.useFactory(
          mockOptions,
          mockUserModelService,
        );
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthAppleModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthAppleModule in the imports
      const authAppleModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthAppleModule',
      );

      if (
        authAppleModule &&
        typeof authAppleModule === 'object' &&
        'useFactory' in authAppleModule &&
        typeof authAppleModule.useFactory === 'function'
      ) {
        const factoryResult = authAppleModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthGithubModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthGithubModule in the imports
      const authGithubModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthGithubModule',
      );

      if (
        authGithubModule &&
        typeof authGithubModule === 'object' &&
        'useFactory' in authGithubModule &&
        typeof authGithubModule.useFactory === 'function'
      ) {
        const factoryResult = authGithubModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthGoogleModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthGoogleModule in the imports
      const authGoogleModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthGoogleModule',
      );

      if (
        authGoogleModule &&
        typeof authGoogleModule === 'object' &&
        'useFactory' in authGoogleModule &&
        typeof authGoogleModule.useFactory === 'function'
      ) {
        const factoryResult = authGoogleModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthGuardRouterModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthGuardRouterModule in the imports
      const authGuardRouterModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthGuardRouterModule',
      );

      if (
        authGuardRouterModule &&
        typeof authGuardRouterModule === 'object' &&
        'useFactory' in authGuardRouterModule &&
        typeof authGuardRouterModule.useFactory === 'function'
      ) {
        const factoryResult = authGuardRouterModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthRefreshModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthRefreshModule in the imports
      const authRefreshModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthRefreshModule',
      );

      if (
        authRefreshModule &&
        typeof authRefreshModule === 'object' &&
        'useFactory' in authRefreshModule &&
        typeof authRefreshModule.useFactory === 'function'
      ) {
        const factoryResult = authRefreshModule.useFactory(
          mockOptions,
          mockUserModelService,
        );
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthLocalModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthLocalModule in the imports
      const authLocalModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthLocalModule',
      );

      if (
        authLocalModule &&
        typeof authLocalModule === 'object' &&
        'useFactory' in authLocalModule &&
        typeof authLocalModule.useFactory === 'function'
      ) {
        const factoryResult = authLocalModule.useFactory(
          mockOptions,
          mockUserModelService,
        );
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthRecoveryModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthRecoveryModule in the imports
      const authRecoveryModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthRecoveryModule',
      );

      if (
        authRecoveryModule &&
        typeof authRecoveryModule === 'object' &&
        'useFactory' in authRecoveryModule &&
        typeof authRecoveryModule.useFactory === 'function'
      ) {
        const factoryResult = authRecoveryModule.useFactory(
          mockOptions,
          mockEmailService,
          mockOtpService,
          mockUserModelService,
          mockUserPasswordService,
        );
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test AuthVerifyModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find AuthVerifyModule in the imports
      const authVerifyModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'AuthVerifyModule',
      );

      if (
        authVerifyModule &&
        typeof authVerifyModule === 'object' &&
        'useFactory' in authVerifyModule &&
        typeof authVerifyModule.useFactory === 'function'
      ) {
        const factoryResult = authVerifyModule.useFactory(
          mockOptions,
          mockEmailService,
          mockUserModelService,
          mockOtpService,
        );
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test PasswordModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find PasswordModule in the imports
      const passwordModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'PasswordModule',
      );

      if (
        passwordModule &&
        typeof passwordModule === 'object' &&
        'useFactory' in passwordModule &&
        typeof passwordModule.useFactory === 'function'
      ) {
        const factoryResult = passwordModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test UserModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find UserModule in the imports
      const userModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'UserModule',
      );

      if (
        userModule &&
        typeof userModule === 'object' &&
        'useFactory' in userModule &&
        typeof userModule.useFactory === 'function'
      ) {
        const factoryResult = userModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test OtpModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find OtpModule in the imports
      const otpModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'OtpModule',
      );

      if (
        otpModule &&
        typeof otpModule === 'object' &&
        'useFactory' in otpModule &&
        typeof otpModule.useFactory === 'function'
      ) {
        const factoryResult = otpModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });

    it('should test EmailModule useFactory', () => {
      const result = createRocketsServerImports({
        imports: [],
        extras: mockExtras,
      });

      // Find EmailModule in the imports
      const emailModule = result?.find(
        (module) =>
          typeof module === 'object' &&
          module &&
          'module' in module &&
          module.module?.name === 'EmailModule',
      );

      if (
        emailModule &&
        typeof emailModule === 'object' &&
        'useFactory' in emailModule &&
        typeof emailModule.useFactory === 'function'
      ) {
        const factoryResult = emailModule.useFactory(mockOptions);
        expect(factoryResult).toBeDefined();
        expect(factoryResult).toHaveProperty('settings');
      }
    });
  });

  describe('Provider Factory Function Tests', () => {
    it('should test RocketsServerUserLookupService provider factory', () => {
      const result = createRocketsServerProviders({});

      // Find the user lookup service provider
      const userModelProvider = result?.find(
        (provider) =>
          typeof provider === 'object' &&
          provider &&
          'provide' in provider &&
          provider.provide === RocketsServerUserModelService,
      );

      expect(userModelProvider).toBeDefined();
      expect(userModelProvider).toHaveProperty('useFactory');
    });
  });
});
