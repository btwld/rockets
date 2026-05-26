import {
  INestApplication,
  Controller,
  Get,
  Post,
  Module,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthPublic, AuthUser } from '@concepta/nestjs-authentication';
import { AuthorizedUser } from './domain/interfaces/auth-user.interface';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';

import { FirebaseAuthAdapterFixture } from './__fixtures__/providers/firebase-auth.adapter.fixture';
import { ServerAuthAdapterFixture } from './__fixtures__/providers/server-auth.adapter.fixture';
import { FailingAuthAdapterFixture } from './__fixtures__/providers/failing-auth.adapter.fixture';
import { E2eFakeRepositoryModule } from './__e2e__/helpers/e2e-fake-repository.module';
import type { RocketsOptions } from './rockets.module-definition';
import { StubUserMetadataEntity } from './__fixtures__/entities/stub-user-metadata.entity';
import { RocketsModule } from './rockets.module';

@ApiTags('test')
@Controller('test')
class TestController {
  @Get('protected')
  @ApiOkResponse({ description: 'Protected route response' })
  protectedRoute(@AuthUser() user: AuthorizedUser): {
    message: string;
    user: AuthorizedUser;
  } {
    return {
      message: 'This is a protected route',
      user,
    };
  }

  @Get('public')
  @AuthPublic()
  @ApiOkResponse({ description: 'Public route response' })
  publicRoute(): { message: string } {
    return {
      message: 'This is a public route',
    };
  }

  @Post('admin-only')
  @HttpCode(200)
  @ApiOkResponse({ description: 'Admin only route response' })
  adminOnlyRoute(@AuthUser() user: AuthorizedUser): {
    message: string;
    user: AuthorizedUser;
  } {
    return {
      message: 'Admin only access granted',
      user,
    };
  }

  @Get('user-data')
  @ApiOkResponse({ description: 'User data response' })
  getUserData(@AuthUser() user: AuthorizedUser): {
    id: string;
    email: string;
    roles: string[];
    message: string;
  } {
    return {
      id: user.id,
      email: user.email || 'no-email',
      roles: user.userRoles?.map((ur) => ur.role.name) || [],
      message: 'User data retrieved successfully',
    };
  }
}

@Module({
  controllers: [TestController],
})
class TestModule {}

describe('RocketsModule (e2e)', () => {
  let app: INestApplication;

  class TestUserMetadataCreateDto implements UserMetadataCreatableInterface {
    @IsNotEmpty()
    @IsString()
    userId!: string;

    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    [key: string]: unknown;
  }

  class TestUserMetadataUpdateDto
    implements UserMetadataModelUpdatableInterface
  {
    @IsNotEmpty()
    @IsString()
    id!: string;

    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    [key: string]: unknown;
  }

  const baseOptions: RocketsOptions = {
    settings: {},
    auth: ServerAuthAdapterFixture,
    userMetadata: {
      entity: StubUserMetadataEntity,
      createDto: TestUserMetadataCreateDto,
      updateDto: TestUserMetadataUpdateDto,
    },
    repository: E2eFakeRepositoryModule,
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('Original /user endpoints', () => {
    it('GET /user with ServerAuth provider returns authorized user', async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        userRoles: [{ role: { name: 'admin' } }],
      });
    });

    it('GET /user with Firebase provider returns authorized user', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsModule.forRoot({
            ...baseOptions,
            auth: FirebaseAuthAdapterFixture,
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
        userRoles: [{ role: { name: 'user' } }],
      });
    });

    it('GET /user without token returns 401', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      await request(app.getHttpServer()).get('/me').expect(401);
    });
  });

  describe('Test Controller - AuthGuard Validation', () => {
    it('GET /test/protected with valid token should succeed', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
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
          userRoles: [{ role: { name: 'admin' } }],
        },
      });
    });

    it('GET /test/protected without token should fail with 401', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Authentication failed',
        statusCode: 401,
      });
    });

    it('GET /test/protected with invalid token should fail with 401', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Authentication failed',
        statusCode: 401,
      });
    });

    it('GET /test/protected with malformed Authorization header should fail with 401', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'InvalidFormat token')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Authentication failed',
        statusCode: 401,
      });
    });

    it('GET /test/public should work without authentication', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/public')
        .expect(200);

      expect(res.body).toEqual({
        message: 'This is a public route',
      });
    });

    it('POST /test/admin-only with valid token should succeed', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
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
          userRoles: [{ role: { name: 'admin' } }],
        },
      });
    });

    it('GET /test/user-data should return properly formatted user data', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
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
        message: 'User data retrieved successfully',
      });
    });

    it('GET /test/user-data with Firebase provider should return different user data', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          TestModule,
          RocketsModule.forRoot({
            ...baseOptions,
            auth: FirebaseAuthAdapterFixture,
          }),
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
        message: 'User data retrieved successfully',
      });
    });
  });

  describe('AuthGuard Error Scenarios', () => {
    it('should handle missing Authorization header', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Authentication failed',
        statusCode: 401,
      });
    });

    it('should handle empty Authorization header', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', '')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Authentication failed',
        statusCode: 401,
      });
    });

    it('should handle Authorization header without Bearer prefix', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'token-without-bearer')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Authentication failed',
        statusCode: 401,
      });
    });

    it('should return 401 when Authorization header uses Basic scheme instead of Bearer', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [TestModule, RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Basic abc123')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Authentication failed',
        statusCode: 401,
      });
    });

    it('should return 401 (not 500) when adapter throws an unexpected error', async () => {
      // FailingAuthAdapterFixture always throws a plain Error (e.g. "DB timeout")
      // for recognised credentials. The guard must catch it and return a generic
      // 401 so internal error details are never leaked to the client.
      const moduleRef = await Test.createTestingModule({
        imports: [
          TestModule,
          RocketsModule.forRoot({
            ...baseOptions,
            auth: FailingAuthAdapterFixture,
          }),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Bearer any-token')
        .expect(401);

      expect(res.body).toMatchObject({
        message: 'Authentication failed',
        statusCode: 401,
      });
    });
  });
});
