import { describe, it, expect, afterEach } from 'vitest';
import { INestApplication, Controller, Get, Module } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthUser } from '@concepta/rockets-core';
import { AuthorizedUser } from '../domain/interfaces/auth-user.interface';

import { ServerAuthAdapterFixture } from '../__fixtures__/providers/server-auth.adapter.fixture';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';
import type { RocketsOptions } from '../rockets.module-definition';
import { userMetadataConfigFixture } from '../__fixtures__/schemas/user-metadata.schema.fixture';
import { RocketsModule } from '../rockets.module';

import { e2eAuthBootstrap } from '../__fixtures__/providers/e2e-auth-bootstrap.fixture';

@ApiTags('user-test')
@Controller('user-test')
class UserTestController {
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
}

@Module({
  controllers: [UserTestController],
})
class UserE2eControllersModule {}

describe('RocketsModule - User Integration (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptions = {
    settings: {},
    auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
    userMetadata: userMetadataConfigFixture,
    repository: E2eFakeRepositoryModule,
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('User Functionality', () => {
    it('GET /user should return user data with userMetadata when userMetadata exists', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [UserE2eControllersModule, RocketsModule.forRoot(baseOptions)],
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
        userMetadata: {
          id: 'userMetadata-1',
          userId: 'serverauth-user-1',
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Test user userMetadata',
          location: 'Test City',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String),
        },
      });
    });

    it('PATCH /user should create new userMetadata for user', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [UserE2eControllersModule, RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userMetadata: {
            firstName: 'Updated',
            lastName: 'Name',
            bio: 'Updated bio',
          },
        })
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        userRoles: [{ role: { name: 'admin' } }],
        userMetadata: {
          id: expect.any(String),
          userId: 'serverauth-user-1',
          firstName: 'Updated',
          lastName: 'Name',
          bio: 'Updated bio',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String),
        },
      });
    });

    it('should work with minimal user configuration', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          UserE2eControllersModule,
          RocketsModule.forRoot({
            settings: {},
            auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
            userMetadata: userMetadataConfigFixture,
            repository: E2eFakeRepositoryModule,
          }),
        ],
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
  });
});
