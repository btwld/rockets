import { describe, it, expect, afterEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { E2eFakeRepositoryModule } from './__e2e__/helpers/e2e-fake-repository.module';
import { ServerAuthAdapterFixture } from './__fixtures__/providers/server-auth.adapter.fixture';
import type { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import { userMetadataConfigFixture } from './__fixtures__/schemas/user-metadata.schema.fixture';
import { RocketsModule } from './rockets.module';
import { e2eAuthBootstrap } from './__fixtures__/providers/e2e-auth-bootstrap.fixture';

describe('RocketsModule.forRootAsync (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('boots with useFactory-only async options and serves GET /me', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsModule.forRootAsync({
          useFactory: (): RocketsOptionsInterface => ({ settings: {} }),
          auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
          userMetadata: userMetadataConfigFixture,
          repository: E2eFakeRepositoryModule,
        }),
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
      userMetadata: expect.objectContaining({
        userId: 'serverauth-user-1',
      }),
    });
  });

  it('resolves auth adapter through extras (no useFactory dance)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsModule.forRootAsync({
          useFactory: (): RocketsOptionsInterface => ({ settings: {} }),
          auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
          userMetadata: userMetadataConfigFixture,
          repository: E2eFakeRepositoryModule,
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body.email).toBe('serverauth@example.com');
  });
});
