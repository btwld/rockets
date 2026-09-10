/**
 * E2E bootstrap for {@link UserModule.register} with CQRS handler wiring.
 * Tests that the /me controller works with CommandBus/QueryBus dispatch
 * in a standalone wiring (not through RocketsModule).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { DynamicModule, Module, INestApplication } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  AUTH_ADAPTERS_TOKEN,
  AuthUserContextOverlay,
  USER_METADATA_MODULE_ENTITY_KEY,
  UpsertUserMetadataHandler,
  GetUserMetadataHandler,
  getDynamicRepositoryToken,
} from '@concepta/rockets-core';
import { ServerAuthAdapterFixture } from '../__fixtures__/providers/server-auth.adapter.fixture';
import { UserMetadataRepositoryFixture } from '../__fixtures__/repositories/user-metadata.repository.fixture';
import { userMetadataConfigFixture } from '../__fixtures__/schemas/user-metadata.schema.fixture';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { UserModule } from '../user.module';

@Module({})
class UserMetadataModuleRegisterE2eHarnessModule {
  static forTest(repo: UserMetadataRepositoryFixture): DynamicModule {
    return {
      module: UserMetadataModuleRegisterE2eHarnessModule,
      global: true,
      imports: [CqrsModule.forRoot()],
      providers: [
        {
          provide: getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
          useValue: repo,
        },
        ServerAuthAdapterFixture,
        {
          provide: AUTH_ADAPTERS_TOKEN,
          useFactory: (adapter: ServerAuthAdapterFixture) => [adapter],
          inject: [ServerAuthAdapterFixture],
        },
        Reflector,
        { provide: APP_GUARD, useClass: AuthServerGuard },
        { provide: APP_INTERCEPTOR, useClass: AuthUserContextOverlay },
        UpsertUserMetadataHandler,
        GetUserMetadataHandler,
      ],
      exports: [getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY)],
    };
  }
}

describe('UserModule.register via standalone wiring (e2e)', () => {
  let app: INestApplication;

  async function bootApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        UserMetadataModuleRegisterE2eHarnessModule.forTest(
          new UserMetadataRepositoryFixture(),
        ),
        UserModule.register(userMetadataConfigFixture),
      ],
    }).compile();

    const booted = moduleRef.createNestApplication();
    await booted.init();
    return booted;
  }

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /me uses handler dispatched via CommandBus/QueryBus', async () => {
    app = await bootApp();

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
    app = await bootApp();

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ userMetadata: { firstName: 'E2E', lastName: 'Module' } })
      .expect(200);

    expect(res.body.userMetadata).toMatchObject({
      firstName: 'E2E',
      lastName: 'Module',
    });
  });

  it('PATCH /me validates the body with the per-route schema pipe (no global pipe)', async () => {
    app = await bootApp();

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ userMetadata: { firstName: 42 } })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toMatch(/^userMetadata\.firstName: /);
  });
});
