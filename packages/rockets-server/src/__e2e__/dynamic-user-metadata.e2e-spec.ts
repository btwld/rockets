import { describe, it, expect, afterEach } from 'vitest';
import { INestApplication, Controller, Get, Module } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  AuthUser,
  RocketsCoreExceptionsFilter,
  detailedErrorSerializer,
} from '@concepta/rockets-core';
import { AuthorizedUser } from '../domain/interfaces/auth-user.interface';

import { ServerAuthAdapterFixture } from '../__fixtures__/providers/server-auth.adapter.fixture';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';
import type { RocketsOptions } from '../rockets.module-definition';
import { userMetadataConfigFixture } from '../__fixtures__/schemas/user-metadata.schema.fixture';
import { RocketsModule } from '../rockets.module';
import { e2eAuthBootstrap } from '../__fixtures__/providers/e2e-auth-bootstrap.fixture';

@ApiTags('dynamic-userMetadata-test')
@Controller('dynamic-userMetadata-test')
class DynamicUserMetadataTestController {
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
  controllers: [DynamicUserMetadataTestController],
})
class DynamicUserMetadataE2eControllersModule {}

const seededRow = {
  id: 'userMetadata-1',
  userId: 'serverauth-user-1',
  firstName: 'John',
  lastName: 'Doe',
  bio: 'Test user userMetadata',
  location: 'Test City',
  dateCreated: expect.any(String),
  dateUpdated: expect.any(String),
};

const authorizedUser = {
  id: 'serverauth-user-1',
  sub: 'serverauth-user-1',
  email: 'serverauth@example.com',
  userRoles: [{ role: { name: 'admin' } }],
};

describe('RocketsModule - Dynamic UserMetadata Service (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptions = {
    settings: {},
    auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
    userMetadata: userMetadataConfigFixture,
    repository: E2eFakeRepositoryModule,
  };

  async function bootApp(
    options: RocketsOptions,
    withRocketsFilter = false,
  ): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DynamicUserMetadataE2eControllersModule,
        RocketsModule.forRoot(options),
      ],
    }).compile();

    const booted = moduleRef.createNestApplication();
    if (withRocketsFilter) {
      booted.useGlobalFilters(
        new RocketsCoreExceptionsFilter(
          booted.get(HttpAdapterHost),
          detailedErrorSerializer,
        ),
      );
    }
    await booted.init();
    return booted;
  }

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('Dynamic UserMetadata Handler Functionality', () => {
    it('should work with custom schemas via default handlers', async () => {
      app = await bootApp(baseOptions);

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toMatchObject({
        ...authorizedUser,
        userMetadata: seededRow,
      });
    });

    it('should handle custom userMetadata structure', async () => {
      app = await bootApp(baseOptions);

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send({ userMetadata: { firstName: 'James', bio: 'James Developer' } })
        .expect(200);

      expect(res.body).toMatchObject({
        ...authorizedUser,
        userMetadata: {
          ...seededRow,
          firstName: 'James',
          bio: 'James Developer',
        },
      });
    });

    it('should handle partial userMetadata updates', async () => {
      app = await bootApp(baseOptions);

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send({
          userMetadata: { bio: 'Updated bio', email: 'newemail@example.com' },
        })
        .expect(200);

      expect(res.body).toMatchObject({
        ...authorizedUser,
        userMetadata: {
          ...seededRow,
          bio: 'Updated bio',
          email: 'newemail@example.com',
        },
      });
    });

    it('should handle complex nested userMetadata', async () => {
      app = await bootApp(baseOptions);

      const userMetadata = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        bio: 'Software Developer with expertise in TypeScript and NestJS',
      };

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send({ userMetadata })
        .expect(200);

      expect(res.body).toMatchObject({
        ...authorizedUser,
        userMetadata: { ...seededRow, ...userMetadata },
      });
    });

    it('should validate userMetadata and surface the schema message and path', async () => {
      app = await bootApp(baseOptions, true);

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send({ userMetadata: { firstName: 'John', username: 'usr' } })
        .expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message:
          'userMetadata.username: Username must be at least 5 characters long',
        details: [
          {
            path: ['userMetadata', 'username'],
            message: 'Username must be at least 5 characters long',
          },
        ],
      });
    });

    it('should pass validation with valid username', async () => {
      app = await bootApp(baseOptions);

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send({ userMetadata: { firstName: 'John', username: 'john_doe' } })
        .expect(200);

      expect(res.body).toMatchObject({
        ...authorizedUser,
        userMetadata: { ...seededRow, username: 'john_doe' },
      });
    });
  });
});
