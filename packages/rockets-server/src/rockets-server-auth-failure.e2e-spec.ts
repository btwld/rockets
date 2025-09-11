import { INestApplication, Controller, Get, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthUser } from '@concepta/nestjs-authentication';
import { AuthorizedUser } from './interfaces/auth-user.interface';
import { AuthProviderInterface } from './interfaces/auth-provider.interface';

import { FailingAuthProviderFixture } from './__fixtures__/providers/failing-auth.provider.fixture';
import { RocketsServerOptionsInterface } from './interfaces/rockets-server-options.interface';
import { RocketsServerModule } from './rockets-server.module';

// Test controller for authentication failure testing
@Controller('auth-failure-test')
class AuthFailureTestController {
  @Get('protected')
  protectedRoute(@AuthUser() user: AuthorizedUser): { message: string; user: AuthorizedUser } {
    return {
      message: 'This should never be reached',
      user
    };
  }
}

@Module({
  controllers: [AuthFailureTestController],
})
class AuthFailureTestModule {}

describe('RocketsServerModule - Authentication Failure (e2e)', () => {
  let app: INestApplication;

  const failingOptions: RocketsServerOptionsInterface = {
    settings: {},
    authProvider: new FailingAuthProviderFixture(),
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('Authentication Failure Scenarios', () => {
    it('should fail authentication with failing provider', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(failingOptions),
          AuthFailureTestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/auth-failure-test/protected')
        .set('Authorization', 'Bearer any-token')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Invalid authentication token',
        statusCode: 401
      });
    });

    it('should fail authentication with different token formats', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(failingOptions),
          AuthFailureTestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      // Test with various token formats that should all fail
      const testCases = [
        'Bearer valid-looking-token',
        'Bearer expired-token',
        'Bearer malformed-token',
        'Bearer empty',
      ];

      for (const authHeader of testCases) {
        const res = await request(app.getHttpServer())
          .get('/auth-failure-test/protected')
          .set('Authorization', authHeader)
          .expect(401);

        expect(res.body).toMatchObject({
          message: 'Invalid authentication token',
          statusCode: 401
        });
      }
    });

    it('should handle provider throwing different error types', async () => {
      // Create a custom failing provider that throws different error types
      class CustomFailingProvider implements AuthProviderInterface {
        async validateToken(token: string): Promise<AuthorizedUser> {
          if (token === 'timeout-token') {
            throw new Error('Request timeout');
          } else if (token === 'network-token') {
            throw new Error('Network error');
          } else {
            throw new Error('Invalid token');
          }
        }
      }

      const customFailingOptions: RocketsServerOptionsInterface = {
        settings: {},
        authProvider: new CustomFailingProvider(),
      };

      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(customFailingOptions),
          AuthFailureTestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      // Test different error scenarios
      const errorTestCases = [
        { token: 'timeout-token', expectedMessage: 'Invalid authentication token' },
        { token: 'network-token', expectedMessage: 'Invalid authentication token' },
        { token: 'invalid-token', expectedMessage: 'Invalid authentication token' },
      ];

      for (const testCase of errorTestCases) {
        const res = await request(app.getHttpServer())
          .get('/auth-failure-test/protected')
          .set('Authorization', `Bearer ${testCase.token}`)
          .expect(401);

        expect(res.body).toMatchObject({
          message: testCase.expectedMessage,
          statusCode: 401
        });
      }
    });

    it('should demonstrate that public routes still work with failing auth provider', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(failingOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      // Public routes should still work even with failing auth provider
      const res = await request(app.getHttpServer())
        .get('/me/public')
        .expect(200);

      expect(res.body).toEqual({
        message: 'This is a public endpoint'
      });
    });
  });
});