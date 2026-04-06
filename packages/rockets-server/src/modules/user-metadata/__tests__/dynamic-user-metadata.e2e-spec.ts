import {
  INestApplication,
  Controller,
  Get,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthUser } from '@concepta/nestjs-authentication';
import { AuthorizedUser } from '../../../interfaces/auth-user.interface';
import { UserUpdateDto } from '../../user/user.dto';

import { ServerAuthProviderFixture } from '../../../__fixtures__/providers/server-auth.provider.fixture';
import { RocketsServerE2eUserMetadataRepoModule } from '../../../__e2e__/helpers/rockets-server-e2e-app.factory';
import { RocketsOptionsInterface } from '../../../interfaces/rockets-options.interface';
import { RocketsModule } from '../../../rockets.module';
import { UserMetadataModelUpdatableInterface } from '../interfaces/user-metadata.interface';

// Custom DTOs for testing dynamic userMetadata service
import { IsString, IsOptional, IsNotEmpty, MinLength } from 'class-validator';
import { UserMetadataCreatableInterface } from '../interfaces/user-metadata.interface';
import { HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from '../../../filter/exceptions.filter';

class CustomUserMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsNotEmpty()
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
  customField?: string;

  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Username must be at least 5 characters long' })
  username?: string;

  [key: string]: unknown;
}

class CustomUserMetadataUpdateDto
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

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Username must be at least 5 characters long' })
  username?: string;

  [key: string]: unknown;
}

// Test controller for dynamic userMetadata testing
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

/** Controllers only — metadata repo via {@link RocketsServerE2eUserMetadataRepoModule}. */
@Module({
  controllers: [DynamicUserMetadataTestController],
})
class DynamicUserMetadataE2eControllersModule {}

describe('RocketsModule - Dynamic UserMetadata Service (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptionsInterface = {
    settings: {},
    authProvider: new ServerAuthProviderFixture(),
    userMetadata: {
      createDto: CustomUserMetadataCreateDto,
      updateDto: CustomUserMetadataUpdateDto,
    },
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('Dynamic UserMetadata Service Functionality', () => {
    it('should create dynamic userMetadata service with custom DTOs', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot(baseOptions),
          DynamicUserMetadataE2eControllersModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: false,
          forbidUnknownValues: true,
        }),
      );
      await app.init();

      // Test that the dynamic userMetadata service is working
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

    it('should handle custom userMetadata structure with dynamic service', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          DynamicUserMetadataE2eControllersModule,
          RocketsModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: false,
          forbidUnknownValues: true,
        }),
      );
      await app.init();

      // Start with minimal data to isolate validation issue
      const customUserMetadata = {
        userMetadata: {
          firstName: 'James',
          bio: 'James Developer',
        },
      };

      const updateData: UserUpdateDto = customUserMetadata;

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect((response) => {
          if (response.status !== 200) {
            console.error('Error response:', response.status, response.body);
          }
        })
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        userRoles: [{ role: { name: 'admin' } }],
        userMetadata: {
          id: 'userMetadata-1',
          userId: 'serverauth-user-1',
          firstName: 'James',
          lastName: 'Doe',
          bio: 'James Developer',
          location: 'Test City',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String),
        },
      });
    });

    it('should work with different DTO structures', async () => {
      // Test with different DTOs
      const differentOptions: RocketsOptionsInterface = {
        settings: {},
        authProvider: new ServerAuthProviderFixture(),
        userMetadata: {
          createDto: CustomUserMetadataCreateDto,
          updateDto: CustomUserMetadataUpdateDto,
        },
      };

      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot(differentOptions),
          DynamicUserMetadataE2eControllersModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe());
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

    it('should handle partial userMetadata updates', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          DynamicUserMetadataE2eControllersModule,
          RocketsModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe());
      await app.init();

      const partialUpdate: UserUpdateDto = {
        userMetadata: {
          bio: 'Updated bio',
          email: 'newemail@example.com',
        },
      };

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send(partialUpdate)
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        userRoles: [{ role: { name: 'admin' } }],
        userMetadata: {
          id: 'userMetadata-1',
          userId: 'serverauth-user-1',
          firstName: 'John', // Existing from fixture
          lastName: 'Doe', // Existing from fixture
          bio: 'Updated bio', // Updated value
          email: 'newemail@example.com', // Updated value
          location: 'Test City', // Existing from fixture
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
              createDto: CustomUserMetadataCreateDto,
              updateDto: CustomUserMetadataUpdateDto,
            },
          }),
          DynamicUserMetadataE2eControllersModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe());
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

    it('should handle complex nested userMetadata with dynamic service', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          RocketsModule.forRoot(baseOptions),
          DynamicUserMetadataE2eControllersModule,
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: false,
          forbidUnknownValues: true,
        }),
      );
      await app.init();

      const complexUserMetadata = {
        userMetadata: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          bio: 'Software Developer with expertise in TypeScript and NestJS',
        },
      };

      const updateData: UserUpdateDto = complexUserMetadata;

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
          ...complexUserMetadata.userMetadata,
          id: 'userMetadata-1',
          userId: 'serverauth-user-1',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String),
        },
      });
    });

    it('should validate userMetadata and expect errors from dtos with validations', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          DynamicUserMetadataE2eControllersModule,
          RocketsModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: false,
          forbidUnknownValues: true,
        }),
      );
      const httpAdapterHost = app.get(HttpAdapterHost);
      app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
      await app.init();

      // Test with invalid data - username too short (less than 5 characters)
      const invalidData = {
        userMetadata: {
          firstName: 'John',
          username: 'usr', // Only 3 characters - should fail validation
        },
      };

      const updateData: UserUpdateDto = invalidData;

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(400); // Expecting validation error

      expect(res.body).toMatchObject({
        message: ['Username must be at least 5 characters long'],
        statusCode: 400,
      });
    });

    it('should pass validation with valid username', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerE2eUserMetadataRepoModule,
          DynamicUserMetadataE2eControllersModule,
          RocketsModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: false,
          forbidUnknownValues: true,
        }),
      );
      await app.init();

      // Test with valid data - username 5+ characters
      const validData = {
        userMetadata: {
          firstName: 'John',
          username: 'john_doe', // 8 characters - should pass validation
        },
      };

      const updateData: UserUpdateDto = validData;

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
          id: 'userMetadata-1',
          userId: 'serverauth-user-1',
          firstName: 'John',
          lastName: 'Doe', // Existing from fixture
          bio: 'Test user userMetadata', // Existing from fixture
          location: 'Test City', // Existing from fixture
          username: 'john_doe', // Should be saved now
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String),
        },
      });
    });
  });
});
