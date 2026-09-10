import { describe, it, expect, afterEach, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { z } from 'zod';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@concepta/rockets-core';
import {
  RocketsCoreExceptionsFilter,
  USER_METADATA_MODULE_ENTITY_KEY,
  detailedErrorSerializer,
  extractBearerToken,
  getDynamicRepositoryToken,
  withOpenApi,
} from '@concepta/rockets-core';
import { FailingAuthAdapterFixture } from './__fixtures__/providers/failing-auth.adapter.fixture';
import { ServerAuthAdapterFixture } from './__fixtures__/providers/server-auth.adapter.fixture';
import { E2eFakeRepositoryModule } from './__e2e__/helpers/e2e-fake-repository.module';
import type { RocketsOptions } from './rockets.module-definition';
import { StubUserMetadataEntity } from './__fixtures__/entities/stub-user-metadata.entity';
import { userMetadataResponseSchemaFixture } from './__fixtures__/schemas/user-metadata.schema.fixture';
import { UserMetadataRepositoryFixture } from './__fixtures__/repositories/user-metadata.repository.fixture';
import { RocketsModule } from './rockets.module';
import { e2eAuthBootstrap } from './__fixtures__/providers/e2e-auth-bootstrap.fixture';

const metadataUpdateSchema = withOpenApi(
  z.object({ notifyEmail: z.email().optional() }),
  'MeValidationMetadataUpdateDto',
);

class NoMetadataAuthProvider implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };

    if (token === 'no-metadata-token') {
      return {
        matched: true,
        user: {
          id: 'user-without-metadata',
          sub: 'user-without-metadata',
          email: 'nometadata@example.com',
          userRoles: [{ role: { name: 'user' } }],
          claims: {
            sub: 'user-without-metadata',
            email: 'nometadata@example.com',
            roles: ['user'],
          },
        },
      };
    }
    throw new Error('Invalid token');
  }
}

const baseOptions: RocketsOptions = {
  settings: {},
  auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
  userMetadata: {
    entity: StubUserMetadataEntity,
    updateSchema: metadataUpdateSchema,
    responseSchema: userMetadataResponseSchemaFixture,
  },
  repository: E2eFakeRepositoryModule,
};

async function bootApp(options: RocketsOptions): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [RocketsModule.forRoot(options)],
  }).compile();

  const app = moduleRef.createNestApplication();
  // The Rockets filter is what puts `details` on the wire — without it the
  // body is Nest's default 400 envelope (statusCode/message/error only).
  app.useGlobalFilters(
    new RocketsCoreExceptionsFilter(
      app.get(HttpAdapterHost),
      detailedErrorSerializer,
    ),
  );
  await app.init();
  return app;
}

describe('MeController contract (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('PATCH /me returns 400 naming the nested path when userMetadata fails its schema', async () => {
    app = await bootApp(baseOptions);

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ userMetadata: { notifyEmail: 'not-a-valid-email' } })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(res.body.message).toMatch(/^userMetadata\.notifyEmail: /);
    expect(res.body.details).toEqual([
      { path: ['userMetadata', 'notifyEmail'], message: expect.any(String) },
    ]);
  });

  it('PATCH /me forwards only the keys the update schema declares to the upsert', async () => {
    app = await bootApp(baseOptions);
    const repo = app.get<UserMetadataRepositoryFixture>(
      getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
    );
    const update = vi.spyOn(repo, 'update');

    await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send({
        userMetadata: { notifyEmail: 'ok@example.com', role: 'admin' },
      })
      .expect(200);

    // The per-route pipe strips `role` before the command is dispatched;
    // the handler pins `userId` from the caller (never from the payload).
    expect(update).toHaveBeenCalledTimes(1);
    const [existing, data] = update.mock.calls[0];
    const owner = typeof existing === 'string' ? existing : existing.userId;
    expect(data).toEqual({ notifyEmail: 'ok@example.com', userId: owner });
  });

  it('GET /me returns 401 when auth provider rejects token', async () => {
    app = await bootApp({
      ...baseOptions,
      auth: e2eAuthBootstrap(FailingAuthAdapterFixture),
    });

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer any-token')
      .expect(401);
  });

  it('GET /me returns userMetadata: null when the user has no metadata row', async () => {
    app = await bootApp({
      ...baseOptions,
      auth: e2eAuthBootstrap(NoMetadataAuthProvider),
    });

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer no-metadata-token')
      .expect(200);

    expect(res.body).toMatchObject({
      id: 'user-without-metadata',
      sub: 'user-without-metadata',
      email: 'nometadata@example.com',
    });
    expect(res.body).toHaveProperty('userMetadata', null);
  });
});
