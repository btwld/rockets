import { INestApplication, Controller, Get, Post, Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthUser } from '@concepta/nestjs-authentication';
import { Public } from './guards/auth.guard';
import { AuthorizedUser } from './interfaces/auth-user.interface';

import { FirebaseAuthProviderFixture } from './__fixtures__/providers/firebase-auth.provider.fixture';
import { ServerAuthProviderFixture } from './__fixtures__/providers/server-auth.provider.fixture';
import { RocketsServerOptionsInterface } from './interfaces/rockets-server-options.interface';
import { RocketsServerModule } from './rockets-server.module';

// Test controller for comprehensive AuthGuard testing
@Controller('test')
class TestController {
  @Get('protected')
  protectedRoute(@AuthUser() user: AuthorizedUser): { message: string; user: AuthorizedUser } {
    return {
      message: 'This is a protected route',
      user
    };
  }

  @Get('public')
  @Public(true)
  publicRoute(): { message: string } {
    return {
      message: 'This is a public route'
    };
  }

  @Post('admin-only')
  adminOnlyRoute(@AuthUser() user: AuthorizedUser): { message: string; user: AuthorizedUser } {
    return {
      message: 'Admin only access granted',
      user
    };
  }

  @Get('user-data')
  getUserData(@AuthUser() user: AuthorizedUser): { 
    id: string; 
    email: string; 
    roles: string[]; 
    message: string 
  } {
    return {
      id: user.id,
      email: user.email || 'no-email',
      roles: user.roles || [],
      message: 'User data retrieved successfully'
    };
  }
}

// Test module that includes our test controller
@Module({
  controllers: [TestController],
})
class TestModule {}

describe('RocketsServerModule (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsServerOptionsInterface = {
    settings: {},
    authProvider: new ServerAuthProviderFixture(),
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('Original /me endpoints', () => {
    it('GET /me with ServerAuth provider returns authorized user', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(res.body).toMatchObject({ 
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        roles: ['admin']
      });
    });

    it('GET /me with Firebase provider returns authorized user', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot({
            ...baseOptions,
            authProvider: new FirebaseAuthProviderFixture(),
          }),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer firebase-token')
        .expect(200);

      expect(res.body).toMatchObject({ 
        id: 'firebase-user-1',
        sub: 'firebase-user-1',
        email: 'firebase@example.com',
        roles: ['user']
      });
    });

    it('GET /me/public returns public data without authentication', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/me/public')
        .expect(200);

      expect(res.body).toEqual({ 
        message: 'This is a public endpoint'
      });
    });

    it('GET /me without token returns 401', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer())
        .get('/me')
        .expect(401);
    });
  });

  describe('Test Controller - AuthGuard Validation', () => {
    it('GET /test/protected with valid token should succeed', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toMatchObject({
        message: 'This is a protected route',
        user: {
          id: 'serverauth-user-1',
          sub: 'serverauth-user-1',
          email: 'serverauth@example.com',
          roles: ['admin']
        }
      });
    });

    it('GET /test/protected without token should fail with 401', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'No authentication token provided',
        statusCode: 401
      });
    });

    it('GET /test/protected with invalid token should fail with 401', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Invalid authentication token',
        statusCode: 401
      });
    });

    it('GET /test/protected with malformed Authorization header should fail with 401', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'No authentication token provided',
        statusCode: 401
      });
    });

    it('GET /test/public should work without authentication', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/public')
        .expect(200);

      expect(res.body).toEqual({
        message: 'This is a public route'
      });
    });

    it('POST /test/admin-only with valid token should succeed', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .post('/test/admin-only')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toMatchObject({
        message: 'Admin only access granted',
        user: {
          id: 'serverauth-user-1',
          sub: 'serverauth-user-1',
          email: 'serverauth@example.com',
          roles: ['admin']
        }
      });
    });

    it('GET /test/user-data should return properly formatted user data', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/user-data')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        email: 'serverauth@example.com',
        roles: ['admin'],
        message: 'User data retrieved successfully'
      });
    });

    it('GET /test/user-data with Firebase provider should return different user data', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot({
            ...baseOptions,
            authProvider: new FirebaseAuthProviderFixture(),
          }),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/user-data')
        .set('Authorization', 'Bearer firebase-token')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'firebase-user-1',
        email: 'firebase@example.com',
        roles: ['user'],
        message: 'User data retrieved successfully'
      });
    });
  });

  describe('AuthGuard Error Scenarios', () => {
    it('should handle missing Authorization header', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'No authentication token provided',
        statusCode: 401
      });
    });

    it('should handle empty Authorization header', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', '')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'No authentication token provided',
        statusCode: 401
      });
    });

    it('should handle Authorization header without Bearer prefix', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          TestModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'token-without-bearer')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'No authentication token provided',
        statusCode: 401
      });
    });
  });
});