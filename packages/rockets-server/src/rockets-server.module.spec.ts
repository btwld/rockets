import {
  JwtIssueTokenService,
  JwtModule,
  JwtService,
  JwtVerifyTokenService,
} from '@concepta/nestjs-jwt';
import { DynamicModule, Global, Module, ModuleMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { GlobalModuleFixture } from './__fixtures__/global.module.fixture';

import { AuthJwtGuard, AuthJwtStrategy } from '@concepta/nestjs-auth-jwt';
import { AuthRefreshGuard } from '@concepta/nestjs-auth-refresh';
import { AuthRefreshStrategy } from '@concepta/nestjs-auth-refresh/dist/auth-refresh.strategy';
import {
  IssueTokenService,
  VerifyTokenService,
} from '@concepta/nestjs-authentication';
import { EmailSendInterface } from '@concepta/nestjs-common';
import { ormConfig } from './__fixtures__/ormconfig.fixture';
import { IssueTokenServiceFixture } from './__fixtures__/services/issue-token.service.fixture';
import { ValidateTokenServiceFixture } from './__fixtures__/services/validate-token.service.fixture';
import { UserOtpEntityFixture } from './__fixtures__/user/user-otp-entity.fixture';
import { UserPasswordHistoryEntityFixture } from './__fixtures__/user/user-password-history.entity.fixture';
import { UserProfileEntityFixture } from './__fixtures__/user/user-profile.entity.fixture';
import { UserFixture } from './__fixtures__/user/user.entity.fixture';
import { FederatedEntityFixture } from './__fixtures__/federated/federated.entity.fixture';
import { RocketsServerOptionsInterface } from './interfaces/rockets-server-options.interface';
import { RocketsServerUserModelServiceInterface } from './interfaces/rockets-server-user-model-service.interface';
import { RocketsServerModule } from './rockets-server.module';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { RocketsServerUserCreateDto } from './dto/user/rockets-server-user-create.dto';
import { RocketsServerUserUpdateDto } from './dto/user/rockets-server-user-update.dto';
import { RocketsServerUserDto } from './dto/user/rockets-server-user.dto';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRoleEntityFixture } from './__fixtures__/role/user-role.entity.fixture';
import { RoleEntityFixture } from './__fixtures__/role/role.entity.fixture';
import { AdminUserTypeOrmCrudAdapter } from './__fixtures__/admin/admin-user-crud.adapter';
// Mock user lookup service
export const mockUserModelService: RocketsServerUserModelServiceInterface = {
  bySubject: jest.fn().mockResolvedValue({ id: '1', username: 'test' }),
  byUsername: jest.fn().mockResolvedValue({ id: '1', username: 'test' }),
  byId: jest.fn().mockResolvedValue({ id: '1', username: 'test' }),
  byEmail: jest.fn().mockResolvedValue({
    id: '1',
    username: 'test',
    email: 'test@example.com',
  }),
  update: jest.fn().mockResolvedValue({ id: '1', username: 'test' }),
  create: jest.fn().mockResolvedValue({ id: '1', username: 'test' }),
  replace: jest.fn().mockResolvedValue({ id: '1', username: 'test' }),
  remove: jest.fn().mockResolvedValue({ id: '1', username: 'test' }),
};

// Mock email service
export const mockEmailService: EmailSendInterface = {
  sendMail: jest.fn().mockResolvedValue(undefined),
};

@Global()
@Module({
  providers: [],
})
export class TypeOrmModuleFixture {}
// Mock configuration module
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: jest.fn().mockImplementation((key) => {
          if (key === 'jwt.secret') return 'test-secret';
          if (key === 'jwt.expiresIn') return '1h';
          return null;
        }),
      },
    },
  ],
  exports: [ConfigService],
})
class MockConfigModule {}

// Test module factory function matching the pattern used in other authentication specs
function testModuleFactory(
  extraImports: DynamicModule['imports'] = [],
): ModuleMetadata {
  return {
    imports: [
      GlobalModuleFixture,
      MockConfigModule,
      JwtModule.forRoot({}),
      TypeOrmModule.forRoot({
        ...ormConfig,
        entities: [
          UserFixture,
          UserProfileEntityFixture,
          UserOtpEntityFixture,
          UserPasswordHistoryEntityFixture,
          FederatedEntityFixture,
          UserRoleEntityFixture,
          RoleEntityFixture,
        ],
      }),
      TypeOrmModule.forFeature([
        UserFixture,
        UserRoleEntityFixture,
        RoleEntityFixture,
      ]),
      TypeOrmExtModule.forRootAsync({
        inject: [],
        useFactory: () => {
          return {
            ...ormConfig,
            entities: [
              UserFixture,
              UserOtpEntityFixture,
              UserPasswordHistoryEntityFixture,
              UserProfileEntityFixture,
              FederatedEntityFixture,
              UserRoleEntityFixture,
              RoleEntityFixture,
            ],
          };
        },
      }),
      ...extraImports,
    ],
  };
}

describe('AuthenticationCombinedImportModule Integration', () => {
  // Helper function to load and assign variables
  function commonVars(testModule: TestingModule) {
    // JWT services
    const jwtService = testModule.get(JwtService);
    const verifyTokenService = testModule.get(VerifyTokenService);
    const issueTokenService = testModule.get(IssueTokenService);
    const jwtIssueTokenService = testModule.get(JwtIssueTokenService);
    const jwtVerifyTokenService = testModule.get(JwtVerifyTokenService);

    // Auth JWT services
    const authJwtStrategy = testModule.get(AuthJwtStrategy);
    const authJwtGuard = testModule.get(AuthJwtGuard);

    // Auth Refresh services
    const authRefreshStrategy = testModule.get(AuthRefreshStrategy);
    const authRefreshGuard = testModule.get(AuthRefreshGuard);

    return {
      jwtService,
      verifyTokenService,
      issueTokenService,
      jwtIssueTokenService,
      jwtVerifyTokenService,
      authJwtStrategy,
      authJwtGuard,
      authRefreshStrategy,
      authRefreshGuard,
    };
  }

  // Common assertions to verify the services are defined
  function commonTests(services: ReturnType<typeof commonVars>) {
    // Verify JWT services are defined
    expect(services.jwtService).toBeDefined();
    expect(services.verifyTokenService).toBeDefined();
    expect(services.issueTokenService).toBeDefined();
    expect(services.jwtIssueTokenService).toBeDefined();
    expect(services.jwtVerifyTokenService).toBeDefined();

    // Verify Auth JWT services
    expect(services.authJwtStrategy).toBeDefined();
    expect(services.authJwtGuard).toBeDefined();

    // Verify Auth Refresh services
    expect(services.authRefreshStrategy).toBeDefined();
    expect(services.authRefreshGuard).toBeDefined();
  }

  describe('forRootAsync with import strategy', () => {
    let testModule: TestingModule;

    it('should define all required services and modules', async () => {
      // Create test module with forRootAsync registration
      testModule = await Test.createTestingModule(
        testModuleFactory([
          RocketsServerModule.forRootAsync({
            imports: [
              TypeOrmModuleFixture,
              MockConfigModule,
              // this should be the entity for the adapter
              TypeOrmModule.forFeature([UserFixture]),
            ],
            inject: [
              ConfigService,
              IssueTokenServiceFixture,
              ValidateTokenServiceFixture,
            ],
            user: {
              imports: [
                TypeOrmExtModule.forFeature({
                  user: {
                    entity: UserFixture,
                  },
                }),
              ],
            },
            otp: {
              imports: [
                TypeOrmExtModule.forFeature({
                  userOtp: {
                    entity: UserOtpEntityFixture,
                  },
                }),
              ],
            },
            role: {
              imports: [
                TypeOrmExtModule.forFeature({
                  role: {
                    entity: RoleEntityFixture,
                  },
                  userRole: {
                    entity: UserRoleEntityFixture,
                  },
                }),
              ],
            },
            federated: {
              imports: [
                TypeOrmExtModule.forFeature({
                  federated: {
                    entity: FederatedEntityFixture,
                  },
                }),
              ],
            },
            admin: {
              imports: [TypeOrmModule.forFeature([UserFixture])],
              adapter: AdminUserTypeOrmCrudAdapter,
              model: RocketsServerUserDto,
              dto: {
                createOne: RocketsServerUserCreateDto,
                createMany: RocketsServerUserCreateDto,
                replaceOne: RocketsServerUserCreateDto,
                updateOne: RocketsServerUserUpdateDto,
              },
            },
            useFactory: (
              configService: ConfigService,
              issueTokenService: IssueTokenServiceFixture,
              validateTokenService: ValidateTokenServiceFixture,
            ): RocketsServerOptionsInterface => ({
              jwt: {
                settings: {
                  access: { secret: configService.get('jwt.secret') },
                  default: { secret: configService.get('jwt.secret') },
                  refresh: { secret: configService.get('jwt.secret') },
                },
              },
              federated: {
                userModelService: mockUserModelService,
              },
              services: {
                userModelService: mockUserModelService,
                mailerService: mockEmailService,
                issueTokenService,
                validateTokenService,
              },
            }),
          }),
        ]),
      ).compile();

      // Get services and run common tests
      const services = commonVars(testModule);
      commonTests(services);

      // Additional tests specific to async registration
      expect(testModule.get(ConfigService)).toBeDefined();

      // Verify that the verifyTokenService is an instance of VerifyTokenService
      const vts = testModule.get(VerifyTokenService);
      expect(vts).toBeInstanceOf(VerifyTokenService);
    });

    it('should define all required services and modules using main imports', async () => {
      // Create test module with forRootAsync registration
      testModule = await Test.createTestingModule(
        testModuleFactory([
          RocketsServerModule.forRootAsync({
            imports: [
              TypeOrmModuleFixture,
              TypeOrmModule.forFeature([UserFixture]),
              TypeOrmExtModule.forFeature({
                user: {
                  entity: UserFixture,
                },
                role: {
                  entity: RoleEntityFixture,
                },
                userRole: {
                  entity: UserRoleEntityFixture,
                },
                userOtp: {
                  entity: UserOtpEntityFixture,
                },
                federated: {
                  entity: FederatedEntityFixture,
                },
              }),
            ],
            inject: [ConfigService],
            admin: {
              imports: [TypeOrmModule.forFeature([UserFixture])],
              adapter: AdminUserTypeOrmCrudAdapter,
              model: RocketsServerUserDto,
              dto: {
                createOne: RocketsServerUserCreateDto,
                createMany: RocketsServerUserCreateDto,
                replaceOne: RocketsServerUserCreateDto,
                updateOne: RocketsServerUserUpdateDto,
              },
            },
            useFactory: (
              configService: ConfigService,
            ): RocketsServerOptionsInterface => ({
              jwt: {
                settings: {
                  access: { secret: configService.get('jwt.secret') },
                  default: { secret: configService.get('jwt.secret') },
                  refresh: { secret: configService.get('jwt.secret') },
                },
              },
              services: {
                mailerService: mockEmailService,
              },
            }),
          }),
        ]),
      ).compile();

      // Get services and run common tests
      const services = commonVars(testModule);
      commonTests(services);

      // Additional tests specific to async registration
      expect(testModule.get(ConfigService)).toBeDefined();

      // Verify that the verifyTokenService is an instance of VerifyTokenService
      const vts = testModule.get(VerifyTokenService);
      expect(vts).toBeInstanceOf(VerifyTokenService);
    });
  });

  describe('forRoot (sync) with direct options', () => {
    let testModule: TestingModule;

    it('should define all required services and modules', async () => {
      // Create test module with forRoot registration
      testModule = await Test.createTestingModule(
        testModuleFactory([
          TypeOrmModuleFixture,
          RocketsServerModule.forRoot({
            admin: {
              imports: [TypeOrmModule.forFeature([UserFixture])],
              adapter: AdminUserTypeOrmCrudAdapter,
              model: RocketsServerUserDto,
              dto: {
                createOne: RocketsServerUserCreateDto,
                createMany: RocketsServerUserCreateDto,
                replaceOne: RocketsServerUserCreateDto,
                updateOne: RocketsServerUserUpdateDto,
              },
            },
            user: {
              imports: [
                TypeOrmExtModule.forFeature({
                  user: {
                    entity: UserFixture,
                  },
                }),
              ],
            },
            otp: {
              imports: [
                TypeOrmExtModule.forFeature({
                  userOtp: {
                    entity: UserOtpEntityFixture,
                  },
                }),
              ],
            },
            role: {
              imports: [
                TypeOrmExtModule.forFeature({
                  role: {
                    entity: RoleEntityFixture,
                  },
                  userRole: {
                    entity: UserRoleEntityFixture,
                  },
                }),
              ],
            },
            federated: {
              imports: [
                TypeOrmExtModule.forFeature({
                  federated: {
                    entity: FederatedEntityFixture,
                  },
                }),
              ],
            },
            jwt: {
              settings: {
                default: { secret: 'test-secret-forroot' },
              },
            },
            services: {
              mailerService: mockEmailService,
            },
          }),
        ]),
      ).compile();

      // Get services and run common tests
      const services = commonVars(testModule);
      commonTests(services);
    });
  });

  describe('with custom refresh controller', () => {
    let testModule: TestingModule;

    it('should use custom refresh controller when provided', async () => {
      // Create test module with custom refresh controller
      testModule = await Test.createTestingModule(
        testModuleFactory([
          TypeOrmModuleFixture,
          RocketsServerModule.forRoot({
            admin: {
              imports: [TypeOrmModule.forFeature([UserFixture])],
              adapter: AdminUserTypeOrmCrudAdapter,
              model: RocketsServerUserDto,
              dto: {
                createOne: RocketsServerUserCreateDto,
                createMany: RocketsServerUserCreateDto,
                replaceOne: RocketsServerUserCreateDto,
                updateOne: RocketsServerUserUpdateDto,
              },
            },
            user: {
              imports: [
                TypeOrmExtModule.forFeature({
                  user: {
                    entity: UserFixture,
                  },
                  userPasswordHistory: {
                    entity: UserPasswordHistoryEntityFixture,
                  },
                  userProfile: {
                    entity: UserProfileEntityFixture,
                  },
                }),
              ],
            },
            otp: {
              imports: [
                TypeOrmExtModule.forFeature({
                  userOtp: {
                    entity: UserOtpEntityFixture,
                  },
                }),
              ],
            },
            role: {
              imports: [
                TypeOrmExtModule.forFeature({
                  role: {
                    entity: RoleEntityFixture,
                  },
                  userRole: {
                    entity: UserRoleEntityFixture,
                  },
                }),
              ],
            },
            federated: {
              imports: [
                TypeOrmExtModule.forFeature({
                  federated: {
                    entity: FederatedEntityFixture,
                  },
                }),
              ],
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
              issueTokenService: new IssueTokenServiceFixture(),
              validateTokenService: new ValidateTokenServiceFixture(),
            },
          }),
        ]),
      ).compile();

      // Verify that the refresh guard is still present
      const authRefreshGuard = testModule.get(AuthRefreshGuard);
      expect(authRefreshGuard).toBeDefined();
    });
  });
});
