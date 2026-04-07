import { INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RocketsServerE2eUserMetadataRepoModule } from './__e2e__/helpers/rockets-server-e2e-app.factory';
import { ServerAuthProviderFixture } from './__fixtures__/providers/server-auth.provider.fixture';
import { UserMetadataEntityFixture } from './__fixtures__/entities/user-metadata.entity.fixture';
import type { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import {
  type UserMetadataCreatableInterface,
  type UserMetadataEntityInterface,
  type UserMetadataModelUpdatableInterface,
  type UserMetadataUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';
import { RocketsModule } from './rockets.module';
import { AbstractGetUserMetadataHandler } from './application/queries/handlers/abstract-get-user-metadata.handler';
import { AbstractUpsertUserMetadataHandler } from './application/commands/handlers/abstract-upsert-user-metadata.handler';
import { GetUserMetadataQuery } from './application/queries/impl/get-user-metadata.query';
import { UpsertUserMetadataCommand } from './application/commands/impl/upsert-user-metadata.command';

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
      id: data && 'id' in data && typeof data.id === 'string' ? data.id : 'override-upsert',
      userId: command.userId,
      firstName: data.firstName ?? 'e2e-custom-upsert-handler',
    }) as UserMetadataEntityInterface;
  }
}

describe('RocketsModule user metadata handler overrides (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptionsInterface = {
    settings: {},
    authProvider: new ServerAuthProviderFixture(),
    userMetadata: {
      createDto: OverrideMetadataCreateDto,
      updateDto: OverrideMetadataUpdateDto,
    },
  };

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('uses custom GetUserMetadataHandler for GET /me', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
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
        RocketsServerE2eUserMetadataRepoModule,
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
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRoot(baseOptions),
      ],
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
