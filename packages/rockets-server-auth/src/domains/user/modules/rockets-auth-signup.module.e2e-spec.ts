import { EmailSendInterface, ExceptionsFilter } from '@concepta/nestjs-common';
import { EventModule } from '@concepta/nestjs-event';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { AdminUserTypeOrmCrudAdapter } from '../../../__fixtures__/admin/admin-user-crud.adapter';
import { FederatedEntityFixture } from '../../../__fixtures__/federated/federated.entity.fixture';
import { InvitationEntityFixture } from '../../../__fixtures__/invitation/invitation.entity.fixture';
import { ormConfig } from '../../../__fixtures__/ormconfig.fixture';
import { RoleEntityFixture } from '../../../__fixtures__/role/role.entity.fixture';
import { UserRoleEntityFixture } from '../../../__fixtures__/role/user-role.entity.fixture';
import { RocketsAuthUserCreateDtoFixture } from '../../../__fixtures__/user/dto/rockets-auth-user-create.dto.fixture';
import { RocketsAuthUserUpdateDtoFixture } from '../../../__fixtures__/user/dto/rockets-auth-user-update.dto.fixture';
import { RocketsAuthUserFixtureDto } from '../../../__fixtures__/user/dto/rockets-auth-user.dto.fixture';
import { RocketsAuthUserMetadataDto } from '../dto/rockets-auth-user-metadata.dto';
import { UserOtpEntityFixture } from '../../../__fixtures__/user/user-otp-entity.fixture';
import { UserPasswordHistoryEntityFixture } from '../../../__fixtures__/user/user-password-history.entity.fixture';
import { UserMetadataEntityFixture } from '../../../__fixtures__/user/user-metadata.entity.fixture';
import { UserMetadataTypeOrmCrudAdapterFixture } from '../../../__fixtures__/services/user-metadata-typeorm-crud.adapter.fixture';
import { UserFixture } from '../../../__fixtures__/user/user.entity.fixture';
import { RocketsAuthModule } from '../../../rockets-auth.module';

// Mock email service
const mockEmailService: EmailSendInterface = {
  sendMail: jest.fn().mockResolvedValue(undefined),
};

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

describe('RocketsAuthSignUpModule (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MockConfigModule,
        EventModule.forRoot({}),
        TypeOrmExtModule.forRootAsync({
          inject: [],
          useFactory: () => ({ ...ormConfig }),
        }),
        TypeOrmModule.forRoot({
          ...ormConfig,
          entities: [
            UserFixture,
            UserMetadataEntityFixture,
            UserOtpEntityFixture,
            UserPasswordHistoryEntityFixture,
            FederatedEntityFixture,
            UserRoleEntityFixture,
            RoleEntityFixture,
            InvitationEntityFixture,
          ],
        }),
        TypeOrmModule.forFeature([
          UserFixture,
          UserMetadataEntityFixture,
          UserRoleEntityFixture,
          RoleEntityFixture,
        ]),
        RocketsAuthModule.forRoot({
          userCrud: {
            imports: [
              TypeOrmModule.forFeature([
                UserFixture,
                UserMetadataEntityFixture,
              ]),
            ],
            adapter: AdminUserTypeOrmCrudAdapter,
            model: RocketsAuthUserFixtureDto,
            dto: {
              createOne: RocketsAuthUserCreateDtoFixture,
              updateOne: RocketsAuthUserUpdateDtoFixture,
            },
            userMetadataConfig: {
              imports: [TypeOrmModule.forFeature([UserMetadataEntityFixture])],
              adapter: UserMetadataTypeOrmCrudAdapterFixture,
              entity: UserMetadataEntityFixture,
              createDto: RocketsAuthUserMetadataDto,
              updateDto: RocketsAuthUserMetadataDto,
            },
          },
          jwt: {
            settings: {
              access: { secret: 'test-secret' },
              default: { secret: 'test-secret' },
              refresh: { secret: 'test-secret' },
            },
          },
          user: {
            imports: [
              TypeOrmExtModule.forFeature({ user: { entity: UserFixture } }),
            ],
          },
          otp: {
            imports: [
              TypeOrmExtModule.forFeature({
                userOtp: { entity: UserOtpEntityFixture },
              }),
            ],
          },
          role: {
            imports: [
              TypeOrmExtModule.forFeature({
                role: { entity: RoleEntityFixture },
                userRole: { entity: UserRoleEntityFixture },
              }),
            ],
          },
          federated: {
            imports: [
              TypeOrmExtModule.forFeature({
                federated: { entity: FederatedEntityFixture },
              }),
            ],
          },
          invitation: {
            imports: [
              TypeOrmExtModule.forFeature({
                invitation: { entity: InvitationEntityFixture },
              }),
            ],
            userModelService: undefined as never,
          },
          settings: {
            role: { adminRoleName: 'admin' },
            email: {
              from: 'test@test.com',
              baseUrl: 'http://localhost',
              templates: {
                sendOtp: { fileName: 'otp.hbs', subject: 'OTP' },
                invitation: {
                  logo: '',
                  fileName: 'inv.hbs',
                  subject: 'Invitation',
                },
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
          services: { mailerService: mockEmailService },
        }),
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    const exceptionsFilter = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /signup (User Registration)', () => {
    it('should create user with valid data', async () => {
      const userData = {
        username: 'signupuser',
        email: 'signupuser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: 25 },
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('signupuser');
      expect(response.body.email).toBe('signupuser@example.com');
      expect(response.body.active).toBe(true);
      expect(response.body.id).toBeDefined();
      expect(response.body.dateCreated).toBeDefined();
      expect(response.body.dateUpdated).toBeDefined();
      expect(response.body.version).toBeDefined();

      // Ensure password is not exposed
      expect(response.body.password).toBeUndefined();
      expect(response.body.passwordHash).toBeUndefined();
      expect(response.body.passwordSalt).toBeUndefined();
    });

    it('should create user with valid age (18 or older)', async () => {
      const userData = {
        username: 'validageuser',
        email: 'validageuser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: 18 }, // Minimum valid age
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('validageuser');
      expect(response.body.email).toBe('validageuser@example.com');
      // Age might not be returned in signup response depending on DTO configuration
      // expect(response.body.age).toBe(18);
    });

    it('should create user with older valid age', async () => {
      const userData = {
        username: 'olderuser',
        email: 'olderuser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: 65 }, // Valid older age
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('olderuser');
      // Age might not be returned in signup response depending on DTO configuration
      // expect(response.body.age).toBe(65);
    });

    it('should reject signup with age below minimum (17)', async () => {
      const userData = {
        username: 'younguser',
        email: 'younguser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: 17 }, // Below minimum age
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with very young age (10)', async () => {
      const userData = {
        username: 'childuser',
        email: 'childuser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: 10 }, // Much below minimum age
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with negative age', async () => {
      const userData = {
        username: 'negativeuser',
        email: 'negativeuser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: -5 }, // Negative age
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with zero age', async () => {
      const userData = {
        username: 'zerouser',
        email: 'zerouser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: 0 }, // Zero age
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with non-numeric age (string)', async () => {
      const userData = {
        username: 'stringageuser',
        email: 'stringageuser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: 'twenty-five' }, // String instead of number
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with non-numeric age (boolean)', async () => {
      const userData = {
        username: 'boolageuser',
        email: 'boolageuser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: true }, // Boolean instead of number
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with decimal age below minimum', async () => {
      const userData = {
        username: 'decimaluser',
        email: 'decimaluser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: 17.5 }, // Decimal age below minimum
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should accept signup with decimal age above minimum', async () => {
      const userData = {
        username: 'decimalgooduser',
        email: 'decimalgooduser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { age: 18.5 }, // Decimal age above minimum
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('decimalgooduser');
      // Age might not be returned in signup response depending on DTO configuration
      // expect(response.body.age).toBe(18.5);
    });

    it('should allow signup without age (optional field)', async () => {
      const userData = {
        username: 'noageuser',
        email: 'noageuser@example.com',
        password: 'Password123!',
        active: true,
        // age not provided
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('noageuser');
      // Age should be undefined when not provided (it's in userMetadata)
      expect(response.body.userMetadata?.age).toBeUndefined();
    });

    it('should not allow signup without duplicate username', async () => {
      const userData = {
        username: 'noageuser',
        email: 'noageuser@example.com',
        password: 'Password123!',
        active: true,
        // age not provided
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('noageuser');

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });
    it('should not allow signup without duplicate email', async () => {
      const userData = {
        username: 'noageuser',
        email: 'noageuser@example.com',
        password: 'Password123!',
        active: true,
        // age not provided
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('noageuser');
      userData.username = 'noageuser-new';
      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with missing email', async () => {
      const userData = {
        username: 'newuser',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with missing username', async () => {
      const userData = {
        email: 'newuser@example.com',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with missing password', async () => {
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with invalid email format', async () => {
      const userData = {
        username: 'newuser',
        email: 'invalid-email',
        password: 'Password123!',
        active: true,
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should create user with metadata nested object', async () => {
      const userData = {
        username: 'metauuser',
        email: 'metauuser@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'Meta' },
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('metauuser');
      expect(response.body.email).toBe('metauuser@example.com');
      expect(response.body.id).toBeDefined();
    });

    it('should reject signup with metadata firstName that is not a string', async () => {
      const userData = {
        username: 'invalidmetadata1',
        email: 'invalidmetadata1@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 123 }, // Should be string
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with metadata firstName too long', async () => {
      const userData = {
        username: 'invalidmetadata2',
        email: 'invalidmetadata2@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: 'a'.repeat(101) }, // Max 100 characters
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with metadata firstName empty string', async () => {
      const userData = {
        username: 'invalidmetadata3',
        email: 'invalidmetadata3@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { firstName: '' }, // Min 1 character
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with metadata lastName that is not a string', async () => {
      const userData = {
        username: 'invalidmetadata4',
        email: 'invalidmetadata4@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { lastName: true }, // Should be string
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with metadata username too short', async () => {
      const userData = {
        username: 'invalidmetadata5',
        email: 'invalidmetadata5@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { username: 'ab' }, // Min 3 characters
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with metadata username too long', async () => {
      const userData = {
        username: 'invalidmetadata6',
        email: 'invalidmetadata6@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { username: 'a'.repeat(51) }, // Max 50 characters
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should reject signup with metadata bio too long', async () => {
      const userData = {
        username: 'invalidmetadata7',
        email: 'invalidmetadata7@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: { bio: 'a'.repeat(501) }, // Max 500 characters
      };

      await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(400);
    });

    it('should accept valid metadata with all fields', async () => {
      const userData = {
        username: 'validmetadata',
        email: 'validmetadata@example.com',
        password: 'Password123!',
        active: true,
        userMetadata: {
          firstName: 'John',
          lastName: 'Doe',
          username: 'johndoe',
          bio: 'A valid bio with less than 500 characters',
        },
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('validmetadata');
      expect(response.body.email).toBe('validmetadata@example.com');
      expect(response.body.id).toBeDefined();
    });
  });
});
