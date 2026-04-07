import { INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { RocketsServerE2eUserMetadataRepoModule } from './__e2e__/helpers/rockets-server-e2e-app.factory';
import { ServerAuthProviderFixture } from './__fixtures__/providers/server-auth.provider.fixture';
import type { RocketsOptionsInterface } from './infrastructure/config/interfaces/rockets-options.interface';
import {
  type UserMetadataCreatableInterface,
  type UserMetadataModelUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';
import { RocketsModule } from './rockets.module';

class AsyncE2eMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsOptional()
  @IsString()
  firstName?: string;
}

class AsyncE2eMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsNotEmpty()
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  firstName?: string;
}

@Module({
  providers: [ServerAuthProviderFixture],
  exports: [ServerAuthProviderFixture],
})
class AsyncInjectAuthModule {}

describe('RocketsModule.forRootAsync (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('boots with useFactory-only async options and serves GET /me', async () => {
    const options: RocketsOptionsInterface = {
      settings: {},
      authProvider: new ServerAuthProviderFixture(),
      userMetadata: {
        createDto: AsyncE2eMetadataCreateDto,
        updateDto: AsyncE2eMetadataUpdateDto,
      },
    };

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRootAsync({
          useFactory: (): RocketsOptionsInterface => options,
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

  it('resolves authProvider via inject + useFactory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
        RocketsModule.forRootAsync({
          imports: [AsyncInjectAuthModule],
          inject: [ServerAuthProviderFixture],
          useFactory: (
            auth: ServerAuthProviderFixture,
          ): RocketsOptionsInterface => ({
            settings: {},
            authProvider: auth,
            userMetadata: {
              createDto: AsyncE2eMetadataCreateDto,
              updateDto: AsyncE2eMetadataUpdateDto,
            },
          }),
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
