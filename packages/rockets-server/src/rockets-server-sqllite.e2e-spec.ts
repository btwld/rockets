import { AuthJwtGuard } from '@concepta/nestjs-auth-jwt';
import { EmailSendInterface, ExceptionsFilter } from '@concepta/nestjs-common';
import {
  Controller,
  Get,
  INestApplication,
  Module,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import {
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserOtpEntityFixture } from './__fixtures__/user/user-otp-entity.fixture';
import { UserFixture } from './__fixtures__/user/user.entity.fixture';
import { FederatedEntityFixture } from './__fixtures__/federated/federated.entity.fixture';
import { AuthPasswordController } from './controllers/auth/auth-password.controller';
import { AuthSignupController } from './controllers/auth/auth-signup.controller';
import { RocketsServerModule } from './rockets-server.module';
import { SqliteAdapterModule } from './__fixtures__/sqlite-adapter/sqlite-adapter.module';
import { RoleEntityFixture } from './__fixtures__/role/role.entity.fixture';
import { UserRoleEntityFixture } from './__fixtures__/role/user-role.entity.fixture';

// Test controller with protected route
@Controller('test')
@ApiTags('test')
@UseGuards(AuthJwtGuard)
export class TestController {
  @Get('protected')
  @ApiOkResponse({
    description: 'Successfully accessed protected route',
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized access' })
  async getProtected(): Promise<{ message: string }> {
    return { message: 'This is a protected route' };
  }
}

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

describe('RocketsServer (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        MockConfigModule,
        SqliteAdapterModule.forRoot({
          dbPath: ':memory:',
        }),
        RocketsServerModule.forRoot({
          jwt: {
            settings: {
              access: { secret: 'test-secret' },
              default: { secret: 'test-secret' },
              refresh: { secret: 'test-secret' },
            },
          },
          user: {
            imports: [
              SqliteAdapterModule.forFeature({
                user: {
                  entity: UserFixture,
                },
              }),
            ],
          },
          role: {
            imports: [
              SqliteAdapterModule.forFeature({
                role: {
                  entity: RoleEntityFixture,
                },
                userRole: {
                  entity: UserRoleEntityFixture,
                },
              }),
            ],
          },
          otp: {
            imports: [
              SqliteAdapterModule.forFeature({
                userOtp: {
                  entity: UserOtpEntityFixture,
                },
              }),
            ],
          },
          federated: {
            imports: [
              SqliteAdapterModule.forFeature({
                federated: {
                  entity: FederatedEntityFixture,
                },
              }),
            ],
          },
          services: {
            mailerService: mockEmailService,
          },
        }),
      ],
      controllers: [TestController],
    }).compile();

    app = moduleFixture.createNestApplication();

    const exceptionsFilter = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(exceptionsFilter));
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    // Reset mock implementations before each test
    jest.clearAllMocks();
  });

  const createTestUser = async (username = 'testuser') => {
    return await request(app.getHttpServer())
      .post('/signup')
      .send({
        username,
        email: `${username}@example.com`,
        password: 'Password123!',
        active: true,
      })
      .expect(201);
  };

  describe(AuthPasswordController.name, () => {
    it('should access protected route with valid token', async () => {
      // First create a user via signup
      await createTestUser();

      // Then authenticate with the created user
      const loginData = {
        username: 'testuser',
        password: 'Password123!',
      };

      const loginResponse = await request(app.getHttpServer())
        .post('/token/password')
        .send(loginData)
        .expect(200);

      expect(loginResponse.body).toHaveProperty('accessToken');
      const { accessToken } = loginResponse.body;

      // Make request with the valid token
      const response = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toEqual({
        message: 'This is a protected route',
      });
    });

    it('should reject access to protected route without token', async () => {
      await request(app.getHttpServer()).get('/test/protected').expect(401);
    });

    it('should reject access to protected route with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe(AuthPasswordController.prototype.login, () => {
    it('should reject authentication with invalid username', async () => {
      const loginData = {
        username: 'invaliduser',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/token/password')
        .send(loginData)
        .expect(401);
    });

    it('should reject authentication with invalid password', async () => {
      // First create a user via signup
      await createTestUser('testuser2');

      const loginData = {
        username: 'testuser2',
        password: 'wrongpassword',
      };

      await request(app.getHttpServer())
        .post('/token/password')
        .send(loginData)
        // should t be 401?
        .expect(401);
    });

    it('should reject authentication with missing username', async () => {
      const loginData = {
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/token/password')
        .send(loginData)
        .expect(401);
    });

    it('should reject authentication with missing password', async () => {
      const loginData = {
        username: 'testuser',
      };

      await request(app.getHttpServer())
        .post('/token/password')
        .send(loginData)
        .expect(401);
    });

    it('should reject authentication with empty credentials', async () => {
      const loginData = {};

      await request(app.getHttpServer())
        .post('/token/password')
        .send(loginData)
        .expect(401);
    });
  });

  describe(AuthSignupController.name, () => {
    it('should create new user via signup endpoint', async () => {
      const userData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'Password123!',
        active: true,
      };

      const response = await request(app.getHttpServer())
        .post('/signup')
        .send(userData)
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.username).toBe('newuser');
      expect(response.body.email).toBe('newuser@example.com');
      expect(response.body.id).toBeDefined();
      // Verify password was hashed
      expect(response.body.passwordHash).toBeUndefined();
      expect(response.body.password).toBeUndefined();
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
  });

  describe('RocketsServerRecoveryController', () => {
    describe('POST /recovery/login', () => {
      it('should accept valid email for username recovery', async () => {
        // Create a test user first
        await createTestUser('recoveryuser1');

        const recoveryData = {
          email: 'recoveryuser1@example.com',
        };

        await request(app.getHttpServer())
          .post('/recovery/login')
          .send(recoveryData)
          .expect(201);

        // Verify email service was called
        expect(mockEmailService.sendMail).toHaveBeenCalled();
      });

      it('should accept non-existent email for username recovery (security)', async () => {
        const recoveryData = {
          email: 'nonexistent@example.com',
        };

        await request(app.getHttpServer())
          .post('/recovery/login')
          .send(recoveryData)
          .expect(201);

        // Should still return 201 for security reasons
      });

      it('should not accept invalid email format', async () => {
        const recoveryData = {
          email: 'invalid-email',
        };

        await request(app.getHttpServer())
          .post('/recovery/login')
          .send(recoveryData)
          .expect(400);
      });

      it('should not accept missing email', async () => {
        const recoveryData = {};

        await request(app.getHttpServer())
          .post('/recovery/login')
          .send(recoveryData)
          .expect(400);
      });
    });

    describe('POST /recovery/password', () => {
      it('should accept valid email for password recovery', async () => {
        // Create a test user first
        await createTestUser('recoveryuser2');

        const recoveryData = {
          email: 'recoveryuser2@example.com',
        };

        await request(app.getHttpServer())
          .post('/recovery/password')
          .send(recoveryData)
          .expect(201);

        // Verify email service was called
        expect(mockEmailService.sendMail).toHaveBeenCalled();
      });

      it('should accept non-existent email for password recovery (security)', async () => {
        const recoveryData = {
          email: 'nonexistent@example.com',
        };

        await request(app.getHttpServer())
          .post('/recovery/password')
          .send(recoveryData)
          .expect(201);

        // Should still return 201 for security reasons
      });

      it('should not accept invalid email format', async () => {
        const recoveryData = {
          email: 'invalid-email',
        };

        await request(app.getHttpServer())
          .post('/recovery/password')
          .send(recoveryData)
          .expect(400);
      });

      it('should not accept missing email', async () => {
        const recoveryData = {};

        await request(app.getHttpServer())
          .post('/recovery/password')
          .send(recoveryData)
          .expect(400);
      });
    });

    describe('GET /recovery/passcode/:passcode', () => {
      it('should reject valid passcode (no valid passcode in test)', async () => {
        // Note: In a real scenario, you would need to generate a valid passcode
        // For this test, we expect 400 since we don't have a valid passcode
        const validPasscode = 'valid-test-passcode';

        await request(app.getHttpServer())
          .get(`/recovery/passcode/${validPasscode}`)
          .expect(400);
      });

      it('should reject invalid passcode', async () => {
        const invalidPasscode = 'invalid-passcode';

        await request(app.getHttpServer())
          .get(`/recovery/passcode/${invalidPasscode}`)
          .expect(400);
      });

      it('should reject empty passcode', async () => {
        await request(app.getHttpServer())
          .get('/recovery/passcode/')
          .expect(404);
      });
    });

    describe('PATCH /recovery/password', () => {
      it('should reject password update with test passcode', async () => {
        const updateData = {
          passcode: 'valid-test-passcode',
          newPassword: 'NewPassword123!',
        };

        await request(app.getHttpServer())
          .patch('/recovery/password')
          .send(updateData)
          .expect(400);
      });

      it('should reject password update with invalid passcode', async () => {
        const updateData = {
          passcode: 'invalid-passcode',
          newPassword: 'NewPassword123!',
        };

        await request(app.getHttpServer())
          .patch('/recovery/password')
          .send(updateData)
          .expect(400);
      });

      // TODO: this need to be fixed on rockets  otpservice passcode should not accept undefined
      it('should accept password update with missing passcode (permissive)', async () => {
        const updateData = {
          newPassword: 'NewPassword123!',
        };

        await request(app.getHttpServer())
          .patch('/recovery/password')
          .send(updateData)
          .expect(400);
      });

      it('should reject password update with missing new password', async () => {
        const updateData = {
          passcode: 'valid-test-passcode',
        };

        await request(app.getHttpServer())
          .patch('/recovery/password')
          .send(updateData)
          .expect(400);
      });

      it('should reject weak password', async () => {
        const updateData = {
          passcode: 'valid-test-passcode',
          newPassword: '123',
        };

        await request(app.getHttpServer())
          .patch('/recovery/password')
          .send(updateData)
          .expect(400);
      });
    });
  });

  describe('AuthTokenRefreshController', () => {
    let validRefreshToken: string;
    let refreshTestUser: string;

    beforeAll(async () => {
      // Create a test user and get tokens once for all refresh tests
      refreshTestUser = `refreshuser-${Date.now()}`;
      await createTestUser(refreshTestUser);

      const loginData = {
        username: refreshTestUser,
        password: 'Password123!',
      };

      const loginResponse = await request(app.getHttpServer())
        .post('/token/password')
        .send(loginData)
        .expect(200);

      validRefreshToken = loginResponse.body.refreshToken;
    });

    describe('POST /token/refresh', () => {
      it('should refresh tokens with valid refresh token', async () => {
        const refreshData = {
          refreshToken: validRefreshToken,
        };

        const response = await request(app.getHttpServer())
          .post('/token/refresh')
          .send(refreshData)
          .expect(200);

        expect(response.body).toHaveProperty('accessToken');
        expect(response.body).toHaveProperty('refreshToken');
        expect(typeof response.body.accessToken).toBe('string');
        expect(typeof response.body.refreshToken).toBe('string');

        // Tokens should be valid JWT format
        expect(response.body.accessToken).toMatch(
          /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
        );
        expect(response.body.refreshToken).toMatch(
          /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/,
        );
      });

      it('should reject refresh with invalid token', async () => {
        const refreshData = {
          refreshToken: 'invalid-refresh-token',
        };

        await request(app.getHttpServer())
          .post('/token/refresh')
          .send(refreshData)
          .expect(500);
      });

      it('should reject refresh with missing refresh token', async () => {
        const refreshData = {};

        await request(app.getHttpServer())
          .post('/token/refresh')
          .send(refreshData)
          .expect(401);
      });

      it('should reject refresh with empty refresh token', async () => {
        const refreshData = {
          refreshToken: '',
        };

        await request(app.getHttpServer())
          .post('/token/refresh')
          .send(refreshData)
          .expect(401);
      });

      it('should reject refresh with malformed token', async () => {
        const refreshData = {
          refreshToken: 'malformed.token.here',
        };

        await request(app.getHttpServer())
          .post('/token/refresh')
          .send(refreshData)
          .expect(500);
      });

      it('should allow using new refresh token for subsequent refresh', async () => {
        // First refresh
        const firstRefreshData = {
          refreshToken: validRefreshToken,
        };

        const firstResponse = await request(app.getHttpServer())
          .post('/token/refresh')
          .send(firstRefreshData)
          .expect(200);

        const newRefreshToken = firstResponse.body.refreshToken;

        // Second refresh with new token
        const secondRefreshData = {
          refreshToken: newRefreshToken,
        };

        const secondResponse = await request(app.getHttpServer())
          .post('/token/refresh')
          .send(secondRefreshData)
          .expect(200);

        expect(secondResponse.body).toHaveProperty('accessToken');
        expect(secondResponse.body).toHaveProperty('refreshToken');
      });

      it('should allow reusing old refresh token (current behavior)', async () => {
        // Get a fresh token for this test
        const loginData = {
          username: refreshTestUser,
          password: 'Password123!',
        };

        const loginResponse = await request(app.getHttpServer())
          .post('/token/password')
          .send(loginData)
          .expect(200);

        const freshRefreshToken = loginResponse.body.refreshToken;

        // First refresh
        const refreshData = {
          refreshToken: freshRefreshToken,
        };

        await request(app.getHttpServer())
          .post('/token/refresh')
          .send(refreshData)
          .expect(200);

        // Try to use the old refresh token again - currently allows reuse
        await request(app.getHttpServer())
          .post('/token/refresh')
          .send(refreshData)
          .expect(200);
      });
    });

    describe('Token refresh integration with protected routes', () => {
      it('should access protected route with refreshed access token', async () => {
        // Get a fresh token for this test
        const loginData = {
          username: refreshTestUser,
          password: 'Password123!',
        };

        const loginResponse = await request(app.getHttpServer())
          .post('/token/password')
          .send(loginData)
          .expect(200);

        // Refresh tokens
        const refreshData = {
          refreshToken: loginResponse.body.refreshToken,
        };

        const refreshResponse = await request(app.getHttpServer())
          .post('/token/refresh')
          .send(refreshData)
          .expect(200);

        const newAccessToken = refreshResponse.body.accessToken;

        // Use new access token to access protected route
        const response = await request(app.getHttpServer())
          .get('/test/protected')
          .set('Authorization', `Bearer ${newAccessToken}`)
          .expect(200);

        expect(response.body).toEqual({
          message: 'This is a protected route',
        });
      });
    });
  });

  describe('Complete Authentication Flow', () => {
    it('should handle user registration and immediate login', async () => {
      // Step 1: Create a new user
      const newUserData = {
        username: 'flowuser',
        email: 'flow@example.com',
        password: 'Password123!',
        active: true,
      };

      const signupResponse = await request(app.getHttpServer())
        .post('/signup')
        .send(newUserData)
        .expect(201);

      expect(signupResponse.body).toBeDefined();
      expect(signupResponse.body.username).toBe('flowuser');
      expect(signupResponse.body.passwordHash).toBeUndefined();

      // Step 2: Login with the new user
      const loginData = {
        username: 'flowuser',
        password: 'Password123!',
      };

      const loginResponse = await request(app.getHttpServer())
        .post('/token/password')
        .send(loginData)
        .expect(200);

      expect(loginResponse.body).toHaveProperty('accessToken');
      expect(loginResponse.body).toHaveProperty('refreshToken');

      // Step 3: Access protected route with the received token
      const { accessToken } = loginResponse.body;
      const protectedResponse = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(protectedResponse.body).toEqual({
        message: 'This is a protected route',
      });
    });

    it('should handle authentication failure and prevent protected route access', async () => {
      // Step 1: Attempt login with invalid credentials
      const loginData = {
        username: 'nonexistentuser',
        password: 'wrongpassword',
      };

      await request(app.getHttpServer())
        .post('/token/password')
        .send(loginData)
        .expect(401);

      // Step 2: Attempt to access protected route without valid token
      await request(app.getHttpServer()).get('/test/protected').expect(401);
    });
  });
});
