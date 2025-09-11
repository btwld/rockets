import {
  INestApplication,
  ValidationPipe,
  CanActivate,
  ExecutionContext,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { AuthOAuthController } from './auth-oauth.controller';
import { RocketsServerAuthModule } from '../../rockets-server-auth.module';
import { ormConfig } from '../../__fixtures__/ormconfig.fixture';
import { UserFixture } from '../../__fixtures__/user/user.entity.fixture';
import { UserOtpEntityFixture } from '../../__fixtures__/user/user-otp-entity.fixture';
import { FederatedEntityFixture } from '../../__fixtures__/federated/federated.entity.fixture';
import { RoleEntityFixture } from '../../__fixtures__/role/role.entity.fixture';
import { UserRoleEntityFixture } from '../../__fixtures__/role/user-role.entity.fixture';

// Mock guard for testing
class MockOAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const { provider } = request.query;

    // Mock different scenarios based on provider
    if (provider === 'invalid') {
      return false;
    }

    // Mock successful authentication
    request.user = {
      id: 'test-user-id',
      provider: provider || 'google',
      email: 'test@example.com',
    };

    return true;
  }
}

// Mock mailer service
const mockEmailService = {
  sendMail: jest.fn().mockResolvedValue(undefined),
};

// Mock issue token service
const mockIssueTokenService = {
  responsePayload: jest.fn().mockResolvedValue({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  }),
  accessToken: jest.fn().mockResolvedValue('mock-access-token'),
  refreshToken: jest.fn().mockResolvedValue('mock-refresh-token'),
  discriminator: 'default',
};

describe('AuthOAuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmExtModule.forRootAsync({
          useFactory: () => ormConfig,
        }),
        RocketsServerAuthModule.forRoot({
          user: {
            imports: [
              TypeOrmExtModule.forFeature({
                user: { entity: UserFixture },
              }),
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
          authRouter: {
            guards: [
              { name: 'google', guard: MockOAuthGuard },
              { name: 'github', guard: MockOAuthGuard },
              { name: 'apple', guard: MockOAuthGuard },
            ],
          },
          services: {
            mailerService: mockEmailService,
            issueTokenService: mockIssueTokenService,
          },
        }),
      ],
      controllers: [AuthOAuthController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /oauth/authorize', () => {
    it('should handle authorize with google provider', async () => {
      await request(app.getHttpServer())
        .get('/oauth/authorize?provider=google&scopes=email profile')
        .expect(200);
    });

    it('should handle authorize with github provider', async () => {
      await request(app.getHttpServer())
        .get('/oauth/authorize?provider=github&scopes=user:email')
        .expect(200);
    });

    it('should handle authorize with apple provider', async () => {
      await request(app.getHttpServer())
        .get('/oauth/authorize?provider=apple&scopes=email name')
        .expect(200);
    });

    it('should return 500 when provider is missing', async () => {
      await request(app.getHttpServer())
        .get('/oauth/authorize?scopes=email profile')
        .expect(500);
    });

    it('should return 201 with no scopes (uses default)', async () => {
      await request(app.getHttpServer())
        .get('/oauth/authorize?provider=google')
        .expect(200);
    });

    it('should return 500 when provider is not supported', async () => {
      await request(app.getHttpServer())
        .get('/oauth/authorize?provider=unsupported&scopes=email')
        .expect(500);
    });
  });

  describe('GET /oauth/callback', () => {
    it('should handle callback with google provider and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .get('/oauth/callback?provider=google')
        .expect(200);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'test-user-id',
      );
      expect(response.body).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should handle callback with github provider and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .get('/oauth/callback?provider=github')
        .expect(200);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'test-user-id',
      );
      expect(response.body).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should handle callback with apple provider and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .get('/oauth/callback?provider=apple')
        .expect(200);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'test-user-id',
      );
      expect(response.body).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should return 500 when provider is missing', async () => {
      await request(app.getHttpServer()).get('/oauth/callback').expect(500);
    });

    it('should return 500 when provider is not supported', async () => {
      await request(app.getHttpServer())
        .get('/oauth/callback?provider=unsupported')
        .expect(500);
    });
  });

  describe('POST /oauth/callback', () => {
    it('should handle POST callback with google provider and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/callback?provider=google')
        .expect(201);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'test-user-id',
      );
      expect(response.body).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should handle POST callback with github provider and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/callback?provider=github')
        .expect(201);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'test-user-id',
      );
      expect(response.body).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should handle POST callback with apple provider and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/oauth/callback?provider=apple')
        .expect(201);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'test-user-id',
      );
      expect(response.body).toEqual({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
      });
    });

    it('should return 500 when provider is missing', async () => {
      await request(app.getHttpServer()).post('/oauth/callback').expect(500);
    });

    it('should return 500 when provider is not supported', async () => {
      await request(app.getHttpServer())
        .post('/oauth/callback?provider=unsupported')
        .expect(500);
    });
  });
});
