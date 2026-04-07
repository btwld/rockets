import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ServerAuthProviderFixture } from './__fixtures__/providers/server-auth.provider.fixture';
import { RocketsServerE2eUserMetadataRepoModule } from './__e2e__/helpers/rockets-server-e2e-app.factory';
import type { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import {
  type UserMetadataCreatableInterface,
  type UserMetadataModelUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';
import { RocketsModule } from './rockets.module';

class MinimalMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsNotEmpty()
  @IsString()
  userId!: string;
}

class MinimalMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  firstName?: string;
}

const baseOptions: RocketsOptionsInterface = {
  settings: {},
  authProvider: new ServerAuthProviderFixture(),
  userMetadata: {
    createDto: MinimalMetadataCreateDto,
    updateDto: MinimalMetadataUpdateDto,
  },
};

describe('RocketsModule extras / disableController (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('disableController.me removes GET and PATCH /me', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRoot({
          ...baseOptions,
          disableController: { me: true },
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer valid-token')
      .expect(404);

    await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', 'Bearer valid-token')
      .send({ userMetadata: { firstName: 'x' } })
      .expect(404);
  });
});
