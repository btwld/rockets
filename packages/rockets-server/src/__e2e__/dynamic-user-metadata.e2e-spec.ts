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
import { AuthUser } from '@bitwild/rockets-core';
import { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import { UserUpdateDto } from '../infrastructure/dtos/user.dto';

import { ServerAuthAdapterFixture } from '../__fixtures__/providers/server-auth.adapter.fixture';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';
import type { RocketsOptions } from '../rockets.module-definition';
import { StubUserMetadataEntity } from '../__fixtures__/entities/stub-user-metadata.entity';
import { RocketsModule } from '../rockets.module';
import {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '../domain/interfaces/user-metadata.interface';

import { IsString, IsOptional, IsNotEmpty, MinLength } from 'class-validator';
import { HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from '../infrastructure/filters/exceptions.filter';
import { e2eAuthBootstrap } from '../__fixtures__/providers/e2e-auth-bootstrap.fixture';

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

describe('RocketsModule - Dynamic UserMetadata Service (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptions = {
    settings: {},
    auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
    userMetadata: {
      entity: StubUserMetadataEntity,
      createDto: CustomUserMetadataCreateDto,
      updateDto: CustomUserMetadataUpdateDto,
    },
    repository: E2eFakeRepositoryModule,
  };

  afterEach(async () => {
    if (app) await app.close();
  });

  describe('Dynamic UserMetadata Handler Functionality', () => {
    it('should work with custom DTOs via default handlers', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
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

    it('should handle custom userMetadata structure', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
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
      const differentOptions: RocketsOptions = {
        settings: {},
        auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
        userMetadata: {
          entity: StubUserMetadataEntity,
          createDto: CustomUserMetadataCreateDto,
          updateDto: CustomUserMetadataUpdateDto,
        },
        repository: E2eFakeRepositoryModule,
      };

      const moduleRef = await Test.createTestingModule({
        imports: [
          DynamicUserMetadataE2eControllersModule,
          RocketsModule.forRoot(differentOptions),
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
          firstName: 'John',
          lastName: 'Doe',
          bio: 'Updated bio',
          email: 'newemail@example.com',
          location: 'Test City',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String),
        },
      });
    });

    it('should work with minimal userMetadata configuration', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          DynamicUserMetadataE2eControllersModule,
          RocketsModule.forRoot({
            settings: {},
            auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
            userMetadata: {
              entity: StubUserMetadataEntity,
              createDto: CustomUserMetadataCreateDto,
              updateDto: CustomUserMetadataUpdateDto,
            },
            repository: E2eFakeRepositoryModule,
          }),
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

    it('should handle complex nested userMetadata', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
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

      const invalidData = {
        userMetadata: {
          firstName: 'John',
          username: 'usr',
        },
      };

      const updateData: UserUpdateDto = invalidData;

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', 'Bearer valid-token')
        .send(updateData)
        .expect(400);

      expect(res.body).toMatchObject({
        message: ['Username must be at least 5 characters long'],
        statusCode: 400,
      });
    });

    it('should pass validation with valid username', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
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

      const validData = {
        userMetadata: {
          firstName: 'John',
          username: 'john_doe',
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
          lastName: 'Doe',
          bio: 'Test user userMetadata',
          location: 'Test City',
          username: 'john_doe',
          dateCreated: expect.any(String),
          dateUpdated: expect.any(String),
        },
      });
    });
  });
});
