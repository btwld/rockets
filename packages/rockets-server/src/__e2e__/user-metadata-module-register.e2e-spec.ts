/**
 * E2E bootstrap for {@link UserModule.register} with CQRS handler wiring.
 * Tests that the MeController works with CommandBus/QueryBus dispatch
 * in a standalone wiring (not through RocketsModule).
 */
import {
  DynamicModule,
  Module,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD, HttpAdapterHost, Reflector } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { IsOptional, IsString } from 'class-validator';

import { ServerAuthProviderFixture } from '../__fixtures__/providers/server-auth.provider.fixture';
import { UserMetadataRepositoryFixture } from '../__fixtures__/repositories/user-metadata.repository.fixture';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import type { RocketsOptionsInterface } from '../infrastructure/config/interfaces/rockets-options.interface';
import { RocketsAuthProvider, USER_METADATA_MODULE_ENTITY_KEY } from '../rockets.constants';
import { RAW_OPTIONS_TOKEN } from '../rockets.tokens';
import { UserModule } from '../user.module';
import { UserUpdateDto } from '../infrastructure/dtos/user.dto';
import { UpsertUserMetadataHandler } from '../application/commands/handlers/upsert-user-metadata.handler';
import { GetUserMetadataHandler } from '../application/queries/handlers/get-user-metadata.handler';
import {
  BaseUserMetadataCreateDto,
  BaseUserMetadataUpdateDto,
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '../domain/interfaces/user-metadata.interface';
import { ExceptionsFilter } from '../infrastructure/filters/exceptions.filter';

class E2eUserMetadataCreateDto
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

  [key: string]: unknown;
}

class E2eUserMetadataUpdateDto
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

  [key: string]: unknown;
}

@Module({})
class UserMetadataModuleRegisterE2eHarnessModule {
  static forTest(
    options: RocketsOptionsInterface,
    repo: UserMetadataRepositoryFixture,
  ): DynamicModule {
    return {
      module: UserMetadataModuleRegisterE2eHarnessModule,
      global: true,
      imports: [CqrsModule.forRoot()],
      providers: [
        { provide: RAW_OPTIONS_TOKEN, useValue: options },
        {
          provide: getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
          useValue: repo,
        },
        { provide: RocketsAuthProvider, useClass: ServerAuthProviderFixture },
        Reflector,
        { provide: APP_GUARD, useClass: AuthServerGuard },
        UpsertUserMetadataHandler,
        GetUserMetadataHandler,
      ],
      exports: [
        RAW_OPTIONS_TOKEN,
        getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
      ],
    };
  }
}

describe('UserModule.register via standalone wiring (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptionsInterface = {
    settings: {},
    authProvider: new ServerAuthProviderFixture(),
    userMetadata: {
      createDto: E2eUserMetadataCreateDto,
      updateDto: E2eUserMetadataUpdateDto,
    },
  };

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /me uses handler dispatched via CommandBus/QueryBus', async () => {
    const repo = new UserMetadataRepositoryFixture();
    const moduleRef = await Test.createTestingModule({
      imports: [
        UserMetadataModuleRegisterE2eHarnessModule.forTest(baseOptions, repo),
        UserModule.register(),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body).toMatchObject({
      id: 'serverauth-user-1',
      sub: 'serverauth-user-1',
      userMetadata: expect.objectContaining({
        userId: 'serverauth-user-1',
      }),
    });
  });

  it('PATCH /me exercises upsert via CommandBus', async () => {
    const repo = new UserMetadataRepositoryFixture();
    const moduleRef = await Test.createTestingModule({
      imports: [
        UserMetadataModuleRegisterE2eHarnessModule.forTest(baseOptions, repo),
        UserModule.register(),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

    const body: UserUpdateDto = {
      userMetadata: { firstName: 'E2E', lastName: 'Module' },
    };

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send(body)
      .expect(200);

    expect(res.body.userMetadata).toMatchObject({
      firstName: 'E2E',
      lastName: 'Module',
    });
  });
});
