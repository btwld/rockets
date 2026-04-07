import { INestApplication, Controller, Get, Module } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthUser } from '@concepta/nestjs-authentication';
import { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import { UserUpdateDto } from '../infrastructure/dtos/user.dto';
import { IsString, IsOptional } from 'class-validator';

import { ServerAuthProviderFixture } from '../__fixtures__/providers/server-auth.provider.fixture';
import { RocketsServerE2eUserMetadataRepoModule } from './helpers/rockets-server-e2e-app.factory';
import { RocketsOptionsInterface } from '../infrastructure/config/interfaces/rockets-options.interface';
import { RocketsModule } from '../rockets.module';

import {
  BaseUserMetadataCreateDto,
  BaseUserMetadataUpdateDto,
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
  UserMetadataEntityInterface,
} from '../domain/interfaces/user-metadata.interface';
import { UpsertUserMetadataCommand } from '../application/commands/impl/upsert-user-metadata.command';
import { GetUserMetadataQuery } from '../application/queries/impl/get-user-metadata.query';

class TestUserMetadataCreateDto
  extends BaseUserMetadataCreateDto
  implements UserMetadataCreatableInterface
{
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  location?: string;

  [key: string]: unknown;
}

class TestUserMetadataUpdateDto
  extends BaseUserMetadataUpdateDto
  implements UserMetadataModelUpdatableInterface
{
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  location?: string;

  [key: string]: unknown;
}

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

describe('RocketsModule - UserMetadata Integration (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptionsInterface = {
    settings: {},
    authProvider: new ServerAuthProviderFixture(),
    userMetadata: {
      createDto: TestUserMetadataCreateDto,
      updateDto: TestUserMetadataUpdateDto,
    },
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('UserMetadata Functionality', () => {
    it('GET /me should return user data with userMetadata when userMetadata exists', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot(baseOptions),
          UserMetadataE2eControllersModule,
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

    it('PATCH /me should create new userMetadata for user', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot(baseOptions),
          UserMetadataE2eControllersModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const updateData: UserUpdateDto = {
        userMetadata: {
          firstName: 'Updated',
          lastName: 'Name',
          bio: 'Updated bio',
        },
      };

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
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

    it('should work with minimal userMetadata configuration', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot({
            settings: {},
            authProvider: new ServerAuthProviderFixture(),
            userMetadata: {
              createDto: TestUserMetadataCreateDto,
              updateDto: TestUserMetadataUpdateDto,
            },
          }),
          UserMetadataE2eControllersModule,
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

  describe('CQRS dispatch via CommandBus/QueryBus', () => {
    it('CommandBus should dispatch UpsertUserMetadataCommand to the registered handler', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const commandBus = app.get(CommandBus);
      const result = await commandBus.execute<
        UpsertUserMetadataCommand,
        UserMetadataEntityInterface
      >(
        new UpsertUserMetadataCommand('serverauth-user-1', {
          firstName: 'CommandBus',
        }),
      );

      expect(result).toMatchObject({
        userId: 'serverauth-user-1',
      });
    });

    it('QueryBus should dispatch GetUserMetadataQuery to the registered handler', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const queryBus = app.get(QueryBus);
      const result = await queryBus.execute<
        GetUserMetadataQuery,
        UserMetadataEntityInterface | null
      >(new GetUserMetadataQuery('serverauth-user-1'));

      expect(result).toMatchObject({
        id: 'userMetadata-1',
        userId: 'serverauth-user-1',
      });
    });
  });
});
