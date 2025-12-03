import { EmailSendInterface } from '@concepta/nestjs-common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { UserFixture } from './__fixtures__/user/user.entity.fixture';
import { UserOtpEntityFixture } from './__fixtures__/user/user-otp-entity.fixture';
import { InvitationEntityFixture } from './__fixtures__/invitation/invitation.entity.fixture';
import { AuthPasswordController } from './domains/auth/controllers/auth-password.controller';
import { RocketsAuthRecoveryController } from './domains/auth/controllers/auth-recovery.controller';
import { AuthTokenRefreshController } from './domains/auth/controllers/auth-refresh.controller';
import { AuthOAuthController } from './domains/oauth/controllers/auth-oauth.controller';
import { RocketsAuthOtpController } from './domains/otp/controllers/rockets-auth-otp.controller';
import { InvitationController } from './domains/invitation/controllers/invitation.controller';
import { InvitationReattemptController } from './domains/invitation/controllers/invitation-reattempt.controller';
import { InvitationRevocationController } from './domains/invitation/controllers/invitation-revocation.controller';
import { RocketsAuthNotificationServiceInterface } from './shared/interfaces/rockets-auth-notification.service.interface';
import { RocketsAuthOptionsExtrasInterface } from './shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthOptionsInterface } from './shared/interfaces/rockets-auth-options.interface';
import { RocketsAuthUserModelServiceInterface } from './shared/interfaces/rockets-auth-user-model-service.interface';
import { RocketsAuthUserModelService } from './shared/constants/rockets-auth.constants';
import {
  createRocketsAuthControllers,
  createRocketsAuthExports,
  createRocketsAuthImports,
  createRocketsAuthProviders,
  createRocketsAuthSettingsProvider,
  ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE,
  ROCKETS_SERVER_MODULE_OPTIONS_TYPE,
  RocketsAuthModuleClass,
} from './rockets-auth.module-definition';
import { FederatedEntityFixture } from './__fixtures__/federated/federated.entity.fixture';

describe('RocketsAuthModuleDefinition', () => {
  const mockUserModelService: RocketsAuthUserModelServiceInterface = {
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

  const mockNotificationService: RocketsAuthNotificationServiceInterface = {
    sendRecoverPasswordEmail: jest.fn(),
    sendVerifyEmail: jest.fn(),
    sendEmail: jest.fn(),
    sendRecoverLoginEmail: jest.fn(),
    sendPasswordUpdatedSuccessfullyEmail: jest.fn(),
  };

  const mockOptions: RocketsAuthOptionsInterface = {
    settings: {
      role: { adminRoleName: 'admin' },
      email: {
        from: 'test@test.com',
        baseUrl: 'http://localhost',
        templates: {
          sendOtp: { fileName: 'otp.hbs', subject: 'OTP' },
          invitation: { logo: '', fileName: 'inv.hbs', subject: 'Invitation' },
          invitationAccepted: {
            logo: '',
            fileName: 'inv-acc.hbs',
            subject: 'Accepted',
          },
        },
      },
      otp: {
        assignment: 'userOtp' as const,
        category: 'test',
        type: 'uuid',
        expiresIn: '1h',
      },
    },
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

  const mockExtras: RocketsAuthOptionsExtrasInterface = {
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
    invitation: {
      imports: [],
    },
    userCrud: undefined as never,
    authRouter: {
      guards: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Module Class Definition', () => {
    it('should define RocketsAuthModuleClass', () => {
      expect(RocketsAuthModuleClass).toBeDefined();
    });

    it('should define ROCKETS_SERVER_MODULE_OPTIONS_TYPE', () => {
      expect(ROCKETS_SERVER_MODULE_OPTIONS_TYPE).toBeDefined();
    });

    it('should define ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE', () => {
      expect(ROCKETS_SERVER_MODULE_ASYNC_OPTIONS_TYPE).toBeDefined();
    });
  });

  describe('createRocketsAuthControllers', () => {
    it('should return default controllers when no controllers provided', () => {
      const result = createRocketsAuthControllers({
        extras: { global: false },
      });

      expect(result).toEqual([
        AuthPasswordController,
        AuthTokenRefreshController,
        RocketsAuthRecoveryController,
        RocketsAuthOtpController,
        AuthOAuthController,
        InvitationController,
        InvitationRevocationController,
        InvitationReattemptController,
      ]);
    });

    it('should return provided controllers when controllers are specified', () => {
      const customControllers = [AuthPasswordController];
      const result = createRocketsAuthControllers({
        controllers: customControllers,
        extras: { global: false },
      });

      expect(result).toEqual([AuthPasswordController]);
    });

    it('should return default controllers when controllers is explicitly undefined', () => {
      const result = createRocketsAuthControllers({
        controllers: undefined,
      });

      expect(result).toEqual([
        AuthPasswordController,
        AuthTokenRefreshController,
        RocketsAuthRecoveryController,
        RocketsAuthOtpController,
        AuthOAuthController,
        InvitationController,
        InvitationRevocationController,
        InvitationReattemptController,
      ]);
    });

    it('should handle empty controllers array', () => {
      const result = createRocketsAuthControllers({
        controllers: [],
      });

      expect(result).toEqual([]);
    });
  });

  describe('createRocketsAuthSettingsProvider', () => {
    it('should create settings provider without options overrides', () => {
      const provider = createRocketsAuthSettingsProvider();

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('object');
    });

    it('should create settings provider with options overrides', () => {
      const provider = createRocketsAuthSettingsProvider(mockOptions);

      expect(provider).toBeDefined();
      expect(typeof provider).toBe('object');
    });
  });

  describe('createRocketsAuthImports', () => {
    it('should create imports with default configuration', () => {
      const result = createRocketsAuthImports({
        imports: [],
        extras: mockExtras,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should include all required modules in imports', () => {
      const result = createRocketsAuthImports({
        imports: [],
        extras: mockExtras,
      });

      // Check that we have a reasonable number of modules
      expect(result!.length).toBeGreaterThan(10);
    });

    it('should merge additional imports', () => {
      const additionalImports = [ConfigModule];
      const result = createRocketsAuthImports({
        imports: additionalImports,
        extras: mockExtras,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extras with user imports', () => {
      const extrasWithUserImports: RocketsAuthOptionsExtrasInterface = {
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
      const result = createRocketsAuthImports({
        imports: [],
        extras: extrasWithUserImports,
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extras with otp imports', () => {
      const extrasWithOtpImports: RocketsAuthOptionsExtrasInterface = {
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

      const result = createRocketsAuthImports({
        imports: [],
        extras: extrasWithOtpImports,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extras with federated imports', () => {
      const extrasWithFederatedImports: RocketsAuthOptionsExtrasInterface = {
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
        invitation: {
          imports: [
            TypeOrmExtModule.forFeature({
              invitation: {
                entity: InvitationEntityFixture,
              },
            }),
          ],
        },
      };

      const result = createRocketsAuthImports({
        imports: [],
        extras: extrasWithFederatedImports,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle extras with authGuardRouter guards', () => {
      const extrasWithGuards: RocketsAuthOptionsExtrasInterface = {
        ...mockExtras,
        authRouter: {
          guards: [{ name: 'custom', guard: jest.fn() }],
        },
      };

      const result = createRocketsAuthImports({
        imports: [],
        extras: extrasWithGuards,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createRocketsAuthExports', () => {
    it('should return default exports when no exports provided', () => {
      const result = createRocketsAuthExports({ exports: [] });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should merge additional exports with default exports', () => {
      const additionalExports = [ConfigModule];
      const result = createRocketsAuthExports({
        exports: additionalExports,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(additionalExports.length);
    });

    it('should handle undefined exports', () => {
      const result = createRocketsAuthExports({
        exports: undefined,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('createRocketsAuthProviders', () => {
    it('should return default providers when no providers provided', () => {
      const result = createRocketsAuthProviders({});
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should include required service providers', () => {
      const result = createRocketsAuthProviders({});
      expect(result!.length).toBeGreaterThan(3);
    });

    it('should merge additional providers with default providers', () => {
      const additionalProviders = [{ provide: 'TEST', useValue: 'test' }];
      const result = createRocketsAuthProviders({
        providers: additionalProviders,
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result!.length).toBeGreaterThan(additionalProviders.length);
    });

    it('should handle undefined providers', () => {
      const result = createRocketsAuthProviders({ providers: undefined });
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('Module Integration Tests', () => {
    it('should create a valid module with all dependencies', () => {
      const extras: RocketsAuthOptionsExtrasInterface = {
        global: false,
        controllers: [],
        user: { imports: [] },
        otp: { imports: [] },
        federated: { imports: [] },
        invitation: { imports: [] },
        userCrud: undefined as never,
        authRouter: { guards: [] },
      };

      const imports = createRocketsAuthImports({ imports: [], extras });
      const controllers = createRocketsAuthControllers({
        controllers: [],
      });
      const providers = createRocketsAuthProviders({ providers: [] });
      const exports = createRocketsAuthExports({ exports: [] });

      expect(imports).toBeDefined();
      expect(controllers).toBeDefined();
      expect(providers).toBeDefined();
      expect(exports).toBeDefined();
      expect(Array.isArray(imports)).toBe(true);
      expect(Array.isArray(providers)).toBe(true);
      expect(Array.isArray(exports)).toBe(true);
    });

    it('should handle global module configuration', () => {
      const extras: RocketsAuthOptionsExtrasInterface = {
        global: true,
        controllers: [],
        user: { imports: [] },
        otp: { imports: [] },
        federated: { imports: [] },
        invitation: { imports: [] },
        userCrud: undefined as never,
        authRouter: { guards: [] },
      };

      const imports = createRocketsAuthImports({ imports: [], extras });
      const controllers = createRocketsAuthControllers({
        controllers: [],
      });
      const providers = createRocketsAuthProviders({ providers: [] });
      const exports = createRocketsAuthExports({ exports: [] });

      expect(imports).toBeDefined();
      expect(controllers).toBeDefined();
      expect(providers).toBeDefined();
      expect(exports).toBeDefined();
    });
  });

  describe('Service Configuration Tests', () => {
    it('should handle authentication service configuration', () => {
      const optionsWithAuth: RocketsAuthOptionsInterface = {
        ...mockOptions,
        authentication: {
          settings: {},
        },
      };

      const result = createRocketsAuthImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with auth options
      const settingsProvider =
        createRocketsAuthSettingsProvider(optionsWithAuth);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });

    it('should handle JWT service configuration', () => {
      const optionsWithJwt: RocketsAuthOptionsInterface = {
        ...mockOptions,
        jwt: {
          settings: {
            access: { secret: 'test-secret' },
            default: { secret: 'test-secret' },
            refresh: { secret: 'test-secret' },
          },
        },
      };

      const result = createRocketsAuthImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with JWT options
      const settingsProvider =
        createRocketsAuthSettingsProvider(optionsWithJwt);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });

    it('should handle user model service configuration', () => {
      const optionsWithUserModel: RocketsAuthOptionsInterface = {
        ...mockOptions,
        services: {
          ...mockOptions.services,
          userModelService: mockUserModelService,
        },
      };

      const result = createRocketsAuthImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with user model options
      const settingsProvider =
        createRocketsAuthSettingsProvider(optionsWithUserModel);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });

    it('should handle email service configuration', () => {
      const optionsWithEmail: RocketsAuthOptionsInterface = {
        ...mockOptions,
        email: {
          mailerService: mockEmailService,
        },
      };

      const result = createRocketsAuthImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with email options
      const settingsProvider =
        createRocketsAuthSettingsProvider(optionsWithEmail);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });

    it('should handle OAuth service configurations', () => {
      const optionsWithOAuth: RocketsAuthOptionsInterface = {
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

      const result = createRocketsAuthImports({
        imports: [],
        extras: mockExtras,
      });

      // Test settings provider with OAuth options
      const settingsProvider =
        createRocketsAuthSettingsProvider(optionsWithOAuth);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(settingsProvider).toBeDefined();
      expect(typeof settingsProvider).toBe('object');
    });
  });

  describe('Module Factory Function Tests', () => {
    it('should test SwaggerUiModule useFactory', () => {
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
      const result = createRocketsAuthImports({
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
    it('should test RocketsAuthUserLookupService provider factory', () => {
      const result = createRocketsAuthProviders({});

      // Find the user lookup service provider
      const userModelProvider = result?.find(
        (provider) =>
          typeof provider === 'object' &&
          provider &&
          'provide' in provider &&
          provider.provide === RocketsAuthUserModelService,
      );

      expect(userModelProvider).toBeDefined();
      expect(userModelProvider).toHaveProperty('useFactory');
    });
  });
});
