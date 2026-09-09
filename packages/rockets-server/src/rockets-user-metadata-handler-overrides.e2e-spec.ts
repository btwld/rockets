import { describe, it, expect, afterEach } from 'vitest';
import { INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { E2eFakeRepositoryModule } from './__e2e__/helpers/e2e-fake-repository.module';
import { ServerAuthAdapterFixture } from './__fixtures__/providers/server-auth.adapter.fixture';
import { UserMetadataEntityFixture } from './__fixtures__/entities/user-metadata.entity.fixture';
import {
  userMetadataResponseSchemaFixture,
  userMetadataUpdateSchemaFixture,
} from './__fixtures__/schemas/user-metadata.schema.fixture';
import type { RocketsOptions } from './rockets.module-definition';
import type { UserMetadataEntityInterface } from './domain/interfaces/user-metadata.interface';
import {
  AbstractGetUserMetadataHandler,
  AbstractUpsertUserMetadataHandler,
  GetUserMetadataQuery,
  UpsertUserMetadataCommand,
} from '@concepta/rockets-core';
import { RocketsModule } from './rockets.module';
import { e2eAuthBootstrap } from './__fixtures__/providers/e2e-auth-bootstrap.fixture';

const CUSTOM_GET_MARKER = 'e2e-custom-get-handler';

@Injectable()
class E2eCustomGetUserMetadataHandler extends AbstractGetUserMetadataHandler {
  async execute(
    query: GetUserMetadataQuery,
  ): Promise<UserMetadataEntityInterface | null> {
    return new UserMetadataEntityFixture({
      id: 'override-get',
      userId: query.userId,
      firstName: CUSTOM_GET_MARKER,
    }) as UserMetadataEntityInterface;
  }
}

@Injectable()
class E2eCustomUpsertUserMetadataHandler extends AbstractUpsertUserMetadataHandler {
  async execute(
    command: UpsertUserMetadataCommand,
  ): Promise<UserMetadataEntityInterface> {
    const data = command.data as { firstName?: string };
    return new UserMetadataEntityFixture({
      id: 'override-upsert',
      userId: command.userId,
      firstName: data.firstName ?? 'e2e-custom-upsert-handler',
    }) as UserMetadataEntityInterface;
  }
}

describe('RocketsModule user metadata handler overrides (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptions = {
    settings: {},
    auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
    userMetadata: {
      entity: UserMetadataEntityFixture,
      updateSchema: userMetadataUpdateSchemaFixture,
      responseSchema: userMetadataResponseSchemaFixture,
    },
    repository: E2eFakeRepositoryModule,
  };

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('uses custom GetUserMetadataHandler for GET /me', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsModule.forRoot({
          ...baseOptions,
          handlers: {
            getUserMetadata: E2eCustomGetUserMetadataHandler,
          },
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body.userMetadata).toMatchObject({
      firstName: CUSTOM_GET_MARKER,
      userId: 'serverauth-user-1',
    });
  });

  it('uses custom UpsertUserMetadataHandler for PATCH /me', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsModule.forRoot({
          ...baseOptions,
          handlers: {
            upsertUserMetadata: E2eCustomUpsertUserMetadataHandler,
            getUserMetadata: E2eCustomGetUserMetadataHandler,
          },
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ userMetadata: { firstName: 'patched-by-client' } })
      .expect(200);

    expect(res.body.userMetadata).toMatchObject({
      id: 'override-upsert',
      firstName: 'patched-by-client',
      userId: 'serverauth-user-1',
    });
  });

  it('default handlers still run when handlers option is omitted', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RocketsModule.forRoot(baseOptions)],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(res.body.userMetadata).toMatchObject({
      firstName: 'John',
      userId: 'serverauth-user-1',
    });
  });
});
