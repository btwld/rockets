import { INestApplication, Controller, Get, Module } from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthUser } from '@concepta/nestjs-authentication';
import { AuthorizedUser } from '../../../interfaces/auth-user.interface';
import { UserUpdateDto } from '../user.dto';
import { IsString, IsOptional } from 'class-validator';

import { ServerAuthProviderFixture } from '../../../__fixtures__/providers/server-auth.provider.fixture';
import { RocketsServerE2eUserMetadataRepoModule } from '../../../__e2e__/helpers/rockets-server-e2e-app.factory';
import { RocketsOptionsInterface } from '../../../interfaces/rockets-options.interface';
import { RocketsModule } from '../../../rockets.module';

// Custom DTOs for testing - extending base DTOs
import {
  BaseUserMetadataCreateDto,
  BaseUserMetadataUpdateDto,
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '../../user-metadata/interfaces/user-metadata.interface';

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

// Test controller for user testing
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

  describe('User Functionality', () => {
    it('GET /user should return user data with userMetadata when userMetadata exists', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot(baseOptions),
          UserE2eControllersModule,
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

    it('PATCH /user should create new userMetadata for user', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot(baseOptions),
          UserE2eControllersModule,
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

    it('should work with minimal user configuration', async () => {
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
          UserE2eControllersModule,
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
        // Should not have userMetadata fields when empty
      });
    });
  });
});
