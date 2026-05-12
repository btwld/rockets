import { INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { E2eFakeRepositoryModule } from './__e2e__/helpers/e2e-fake-repository.module';
import { ServerAuthAdapterFixture } from './__fixtures__/providers/server-auth.adapter.fixture';
import { UserMetadataEntityFixture } from './__fixtures__/entities/user-metadata.entity.fixture';
import type { RocketsOptions } from './rockets.module-definition';
import {
  type UserMetadataCreatableInterface,
  type UserMetadataEntityInterface,
  type UserMetadataModelUpdatableInterface,
  type UserMetadataUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';
import {
  AbstractGetUserMetadataHandler,
  AbstractUpsertUserMetadataHandler,
  GetUserMetadataQuery,
  UpsertUserMetadataCommand,
} from '@bitwild/rockets-core';
import { RocketsModule } from './rockets.module';

class OverrideMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  firstName?: string;
}

class OverrideMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  firstName?: string;
}

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
    const data = command.data as UserMetadataUpdatableInterface & {
      firstName?: string;
    };
    return new UserMetadataEntityFixture({
      id:
        data && 'id' in data && typeof data.id === 'string'
          ? data.id
          : 'override-upsert',
      userId: command.userId,
      firstName: data.firstName ?? 'e2e-custom-upsert-handler',
    }) as UserMetadataEntityInterface;
  }
}

describe('RocketsModule user metadata handler overrides (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptions = {
    settings: {},
    auth: ServerAuthAdapterFixture,
    userMetadata: {
      entity: UserMetadataEntityFixture,
      createDto: OverrideMetadataCreateDto,
      updateDto: OverrideMetadataUpdateDto,
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
      .send({
        userMetadata: {
          id: 'patch-override-id',
          firstName: 'patched-by-client',
        },
      })
      .expect(200);

    expect(res.body.userMetadata).toMatchObject({
      id: 'patch-override-id',
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
