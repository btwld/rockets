import { describe, it, expect, afterEach } from 'vitest';
import { INestApplication, Controller, Get, Module } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AuthUser,
  AuthorizedUser,
  GetUserMetadataQuery,
  SwaggerUiService,
  UpsertUserMetadataCommand,
  UserMetadataEntityInterface,
} from '@concepta/rockets-core';

import { ServerAuthAdapterFixture } from '../__fixtures__/providers/server-auth.adapter.fixture';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';
import type { RocketsOptions } from '../rockets.module-definition';
import { userMetadataConfigFixture } from '../__fixtures__/schemas/user-metadata.schema.fixture';
import { RocketsModule } from '../rockets.module';
import { e2eAuthBootstrap } from '../__fixtures__/providers/e2e-auth-bootstrap.fixture';

@ApiTags('userMetadata-test')
@Controller('userMetadata-test')
class UserMetadataTestController {
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
  controllers: [UserMetadataTestController],
})
class UserMetadataE2eControllersModule {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('RocketsModule - UserMetadata Integration (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptions = {
    settings: {},
    auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
    userMetadata: userMetadataConfigFixture,
    repository: E2eFakeRepositoryModule,
  };

  async function bootApp(options: RocketsOptions): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        UserMetadataE2eControllersModule,
        RocketsModule.forRoot(options),
      ],
    }).compile();

    const booted = moduleRef.createNestApplication();
    await booted.init();
    return booted;
  }

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('UserMetadata Functionality', () => {
    it('GET /me should return user data with userMetadata when userMetadata exists', async () => {
      app = await bootApp(baseOptions);

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
          dateCreated: expect.stringMatching(ISO_DATE),
          dateUpdated: expect.stringMatching(ISO_DATE),
        },
      });
    });

    it('GET /me is serialized by the response schema: only declared keys reach the wire', async () => {
      app = await bootApp(baseOptions);

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(Object.keys(res.body).sort()).toEqual([
        'claims',
        'email',
        'id',
        'sub',
        'userMetadata',
        'userRoles',
      ]);
      // The in-memory row carries `version` and `dateDeleted`; the
      // response projection does not declare them.
      expect(res.body.userMetadata).not.toHaveProperty('version');
      expect(res.body.userMetadata).not.toHaveProperty('dateDeleted');
    });

    it('PATCH /me should create new userMetadata for user', async () => {
      app = await bootApp(baseOptions);

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
          dateCreated: expect.stringMatching(ISO_DATE),
          dateUpdated: expect.stringMatching(ISO_DATE),
        },
      });
    });

    it('should work with minimal userMetadata configuration', async () => {
      app = await bootApp({
        settings: {},
        auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
        userMetadata: userMetadataConfigFixture,
        repository: E2eFakeRepositoryModule,
      });

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

  describe('OpenAPI document', () => {
    it('documents /me with named components and $refs', async () => {
      app = await bootApp(baseOptions);

      const document = app
        .get(SwaggerUiService, { strict: false })
        .createDocument(app);

      const schemas = document.components?.schemas ?? {};
      expect(Object.keys(schemas)).toEqual(
        expect.arrayContaining([
          'UserResponseDto',
          'UserUpdateDto',
          'UserMetadataUpdateDto',
          'UserMetadataResponseDto',
        ]),
      );

      const me = document.paths['/me'];
      expect(me?.get?.responses['200']).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserResponseDto' },
          },
        },
      });
      expect(me?.patch?.requestBody).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserUpdateDto' },
          },
        },
      });
      expect(me?.patch?.responses['200']).toMatchObject({
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UserResponseDto' },
          },
        },
      });

      // The app's userMetadata schemas are nested by reference, not inlined.
      expect(JSON.stringify(schemas['UserUpdateDto'])).toContain(
        '#/components/schemas/UserMetadataUpdateDto',
      );
      expect(JSON.stringify(schemas['UserResponseDto'])).toContain(
        '#/components/schemas/UserMetadataResponseDto',
      );
    });
  });

  describe('CQRS dispatch via CommandBus/QueryBus', () => {
    it('CommandBus should dispatch UpsertUserMetadataCommand to the registered handler', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const commandBus = app.get(CommandBus);
      const result = await commandBus.execute<
        UpsertUserMetadataCommand,
        UserMetadataEntityInterface
      >(
        new UpsertUserMetadataCommand({}, 'serverauth-user-1', {
          firstName: 'CommandBus',
        }),
      );

      expect(result).toMatchObject({
        userId: 'serverauth-user-1',
      });
    });

    it('QueryBus should dispatch GetUserMetadataQuery to the registered handler', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [RocketsModule.forRoot(baseOptions)],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const queryBus = app.get(QueryBus);
      const result = await queryBus.execute<
        GetUserMetadataQuery,
        UserMetadataEntityInterface | null
      >(new GetUserMetadataQuery({}, 'serverauth-user-1'));

      expect(result).toMatchObject({
        id: 'userMetadata-1',
        userId: 'serverauth-user-1',
      });
    });
  });
});
