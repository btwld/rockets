import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { FailingAuthProviderFixture } from './__fixtures__/providers/failing-auth.provider.fixture';
import { ServerAuthProviderFixture } from './__fixtures__/providers/server-auth.provider.fixture';
import { RocketsServerE2eUserMetadataRepoModule } from './__e2e__/helpers/rockets-server-e2e-app.factory';
import type { RocketsOptionsInterface } from './interfaces/rockets-options.interface';
import {
  type UserMetadataCreatableInterface,
  type UserMetadataModelUpdatableInterface,
} from './modules/user-metadata/interfaces/user-metadata.interface';
import { RocketsModule } from './rockets.module';

class MetadataCreateDto implements UserMetadataCreatableInterface {
  @IsNotEmpty()
  @IsString()
  userId!: string;
}

/** Rejects invalid email on PATCH /me when `notifyEmail` is sent. */
class MetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsOptional()
  @IsEmail()
  notifyEmail?: string;
}

const baseOptions: RocketsOptionsInterface = {
  settings: {},
  authProvider: new ServerAuthProviderFixture(),
  userMetadata: {
    createDto: MetadataCreateDto,
    updateDto: MetadataUpdateDto,
  },
};

describe('MeController contract (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('PATCH /me returns 400 when dynamic userMetadata fails class-validator', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRoot(baseOptions),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send({
        userMetadata: {
          notifyEmail: 'not-a-valid-email',
        },
      })
      .expect(400);

    expect(res.body.statusCode).toBe(400);
    expect(Array.isArray(res.body.message) || typeof res.body.message === 'string').toBe(
      true,
    );
  });

  it('GET /me returns 401 when auth provider rejects token', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRoot({
          ...baseOptions,
          authProvider: new FailingAuthProviderFixture(),
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer any-token')
      .expect(401);
  });
});
