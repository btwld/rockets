import {
  Controller,
  Get,
  INestApplication,
  Module,
} from '@nestjs/common';
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

class GuardE2eMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsNotEmpty()
  @IsString()
  userId!: string;
}

class GuardE2eMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsNotEmpty()
  @IsString()
  id!: string;
}

@Controller('guard-e2e-open')
class GuardE2eOpenController {
  @Get()
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

@Module({
  controllers: [GuardE2eOpenController],
})
class GuardE2eOpenModule {}

describe('RocketsModule enableGlobalGuard (e2e)', () => {
  let app: INestApplication;

  const baseOptions: RocketsOptionsInterface = {
    settings: {},
    authProvider: new ServerAuthProviderFixture(),
    userMetadata: {
      createDto: GuardE2eMetadataCreateDto,
      updateDto: GuardE2eMetadataUpdateDto,
    },
  };

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('registers global AuthServerGuard by default so anonymous requests are rejected', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
        GuardE2eOpenModule,
        RocketsModule.forRoot(baseOptions),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/guard-e2e-open')
      .expect(401);

    expect(res.body).toMatchObject({
      message: 'No authentication token provided',
      statusCode: 401,
    });
  });

  it('does not register APP_GUARD when enableGlobalGuard is false', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsServerE2eUserMetadataRepoModule,
        GuardE2eOpenModule,
        RocketsModule.forRoot({
          ...baseOptions,
          enableGlobalGuard: false,
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).get('/guard-e2e-open').expect(200, {
      ok: true,
    });
  });
});
