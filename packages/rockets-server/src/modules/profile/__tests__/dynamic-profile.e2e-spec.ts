import { INestApplication, Controller, Get, Patch, Body, Module, Global, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AuthUser } from '@concepta/nestjs-authentication';
import { AuthorizedUser } from '../../../interfaces/auth-user.interface';
import { UserUpdateDto } from '../../user/user.dto';

import { ServerAuthProviderFixture } from '../../../__fixtures__/providers/server-auth.provider.fixture';
import { ProfileEntityFixture } from '../../../__fixtures__/entities/profile.entity.fixture';
import { ProfileRepositoryFixture } from '../../../__fixtures__/repositories/profile.repository.fixture';
import { RocketsServerOptionsInterface } from '../../../interfaces/rockets-server-options.interface';
import { RocketsServerModule } from '../../../rockets-server.module';
import { getDynamicRepositoryToken } from '@concepta/nestjs-common';
import { PROFILE_MODULE_PROFILE_ENTITY_KEY } from '../constants/profile.constants';
import { ProfileModelUpdatableInterface } from '../interfaces/profile.interface';

// Custom DTOs for testing dynamic profile service
import { IsString, IsOptional, IsNotEmpty, ValidateIf, MinLength } from 'class-validator';
import { ProfileCreatableInterface } from '../interfaces/profile.interface';
import { HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from '../../../filter/exceptions.filter';

class CustomProfileCreateDto implements ProfileCreatableInterface {
  @IsNotEmpty()
  @IsString()
  userId: string;

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

class CustomProfileUpdateDto implements ProfileModelUpdatableInterface {
  @IsNotEmpty()
  @IsString()
  id: string;

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

// Test controller for dynamic profile testing
@Controller('dynamic-profile-test')
class DynamicProfileTestController {
  @Get('protected')
  protectedRoute(@AuthUser() user: AuthorizedUser): { message: string; user: AuthorizedUser } {
    return {
      message: 'This is a protected route',
      user
    };
  }
}

//TODO: review this, we should not need it global
@Global()
@Module({
  controllers: [DynamicProfileTestController],
  providers: [
    {
      provide: getDynamicRepositoryToken(PROFILE_MODULE_PROFILE_ENTITY_KEY),
      inject: [],
      useFactory: () => {
        return new ProfileRepositoryFixture();
      },
    }
  ],
  exports: [
    {
      provide: getDynamicRepositoryToken(PROFILE_MODULE_PROFILE_ENTITY_KEY),
      inject: [],
      useFactory: () => {
        return new ProfileRepositoryFixture();
      },
    },
  ],
})
class DynamicProfileTestModule {}

describe('RocketsServerModule - Dynamic Profile Service (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsServerOptionsInterface = {
    settings: {},
    authProvider: new ServerAuthProviderFixture(),
    profile: {
      createDto: CustomProfileCreateDto,
      updateDto: CustomProfileUpdateDto,
    },
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('Dynamic Profile Service Functionality', () => {
    it('should create dynamic profile service with custom DTOs', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          DynamicProfileTestModule,
        ],
        providers: [
          {
            provide: getDynamicRepositoryToken(PROFILE_MODULE_PROFILE_ENTITY_KEY),
            useValue: new ProfileRepositoryFixture(),
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ 
        transform: true, 
        whitelist: true,
        forbidNonWhitelisted: false 
      }));
      await app.init();

      // Test that the dynamic profile service is working
      const res = await request(app.getHttpServer())
        .get('/user')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        roles: ['admin'],
        profile: {
          id: 'profile-1',
          userId: 'serverauth-user-1',
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Test user profile',
          location: 'Test City',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String)
        }
      });
    });

    it('should handle custom profile structure with dynamic service', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          DynamicProfileTestModule,
          RocketsServerModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ 
        transform: true, 
        whitelist: true,
        forbidNonWhitelisted: false 
      }));
      await app.init();

      // Start with minimal data to isolate validation issue
      const customMetadata = {
        profile: {
          firstName: 'James',
          bio: 'James Developer', 
        }
      };

      const updateData: UserUpdateDto = customMetadata;

      const res = await request(app.getHttpServer())
        .patch('/user')
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
        roles: ['admin'],
        profile: {
          id: 'profile-1',
          userId: 'serverauth-user-1',
          firstName: 'James',
          lastName: 'Doe',
          bio: 'James Developer',
          location: 'Test City',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String)
        }
      });
    });

    it('should work with different DTO structures', async () => {
      // Test with different DTOs
      const differentOptions: RocketsServerOptionsInterface = {
        settings: {},
        authProvider: new ServerAuthProviderFixture(),
        profile: {
          createDto: CustomProfileCreateDto,
          updateDto: CustomProfileUpdateDto,
        },
      };

      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(differentOptions),
          DynamicProfileTestModule,
        ],
        providers: [
          {
            provide: getDynamicRepositoryToken(PROFILE_MODULE_PROFILE_ENTITY_KEY),
            useValue: new ProfileRepositoryFixture(),
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ 
        transform: true, 
        whitelist: true,
        forbidNonWhitelisted: false 
      }));
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/user')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        roles: ['admin'],
        profile: {
          id: 'profile-1',
          userId: 'serverauth-user-1',
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Test user profile',
          location: 'Test City',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String)
        }
      });
    });

    it('should handle partial profile updates', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          DynamicProfileTestModule,
          RocketsServerModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ 
        transform: true, 
        whitelist: true,
        forbidNonWhitelisted: false 
      }));
      await app.init();

      const partialUpdate: UserUpdateDto = {
        profile: {
          bio: 'Updated bio',
          email: 'newemail@example.com',
        }
      };

      const res = await request(app.getHttpServer())
        .patch('/user')
        .set('Authorization', 'Bearer valid-token')
        .send(partialUpdate)
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        roles: ['admin'],
        profile: {
          id: 'profile-1',
          userId: 'serverauth-user-1',
          firstName: 'John', // Existing from fixture
          lastName: 'Doe',   // Existing from fixture
          bio: 'Updated bio', // Updated value
          email: 'newemail@example.com', // Updated value
          location: 'Test City', // Existing from fixture
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String)
        }
      });
    });

    it('should work with minimal profile configuration', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot({
            settings: {},
            authProvider: new ServerAuthProviderFixture(),
            profile: {
              createDto: CustomProfileCreateDto,
              updateDto: CustomProfileUpdateDto,
            },
          }),
          DynamicProfileTestModule,
        ],
        providers: [
          {
            provide: getDynamicRepositoryToken(PROFILE_MODULE_PROFILE_ENTITY_KEY),
            useValue: new ProfileRepositoryFixture(),
          },
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ 
        transform: true, 
        whitelist: true,
        forbidNonWhitelisted: false 
      }));
      await app.init();

      const res = await request(app.getHttpServer())
        .get('/user')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        roles: ['admin'],
        profile: {
          id: 'profile-1',
          userId: 'serverauth-user-1',
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Test user profile',
          location: 'Test City',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String)
        }
      });
    });

    it('should handle complex nested profile with dynamic service', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          RocketsServerModule.forRoot(baseOptions),
          DynamicProfileTestModule,
        ],
        providers: [
          {
            provide: getDynamicRepositoryToken(PROFILE_MODULE_PROFILE_ENTITY_KEY),
            useValue: new ProfileRepositoryFixture(),
          }
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ 
        transform: true, 
        whitelist: true,
        forbidNonWhitelisted: false 
      }));
      await app.init();

      const complexMetadata = {
        profile: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          bio: 'Software Developer with expertise in TypeScript and NestJS',
        }
      };

      const updateData: UserUpdateDto = complexMetadata;

      const res = await request(app.getHttpServer())
        .patch('/user')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        roles: ['admin'],
        profile: {
          ...complexMetadata.profile,
          id: 'profile-1',
          userId: 'serverauth-user-1',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String),
        }
      });
    });

    it('should validate profile and expect errors from dtos with validations', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          DynamicProfileTestModule,
          RocketsServerModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ 
        transform: true, 
        whitelist: true,
        forbidNonWhitelisted: false 
      }));
      const httpAdapterHost = app.get(HttpAdapterHost);
      app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
      await app.init();

      // Test with invalid data - username too short (less than 5 characters)
      const invalidData = {
        profile: {
          firstName: 'John',
          username: 'usr', // Only 3 characters - should fail validation
        }
      };

      const updateData: UserUpdateDto = invalidData;

      const res = await request(app.getHttpServer())
        .patch('/user')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(400); // Expecting validation error

      expect(res.body).toMatchObject({
        message: ["Username must be at least 5 characters long"],
        statusCode: 400
      });
    });

    it('should pass validation with valid username', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          DynamicProfileTestModule,
          RocketsServerModule.forRoot(baseOptions),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      app.useGlobalPipes(new ValidationPipe({ 
        transform: true, 
        whitelist: true,
        forbidNonWhitelisted: false 
      }));
      await app.init();

      // Test with valid data - username 5+ characters
      const validData = {
        profile: {
          firstName: 'John',
          username: 'john_doe', // 8 characters - should pass validation
        }
      };

      const updateData: UserUpdateDto = validData;

      const res = await request(app.getHttpServer())
        .patch('/user')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'serverauth-user-1',
        sub: 'serverauth-user-1',
        email: 'serverauth@example.com',
        roles: ['admin'],
        profile: {
          id: 'profile-1',
          userId: 'serverauth-user-1',
          firstName: 'John',
          lastName: 'Doe', // Existing from fixture
          bio: 'Test user profile', // Existing from fixture
          location: 'Test City', // Existing from fixture
          username: 'john_doe', // Should be saved now
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String)
        }
      });
    });
  });
});
