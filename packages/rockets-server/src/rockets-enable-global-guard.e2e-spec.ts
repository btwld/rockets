import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import request from 'supertest';
import { IsNotEmpty, IsString } from 'class-validator';
import { E2eFakeRepositoryModule } from './__e2e__/helpers/e2e-fake-repository.module';
import { ServerAuthAdapterFixture } from './__fixtures__/providers/server-auth.adapter.fixture';
import type { RocketsOptions } from './rockets.module-definition';
import { StubUserMetadataEntity } from './__fixtures__/entities/stub-user-metadata.entity';
import {
  type UserMetadataCreatableInterface,
  type UserMetadataModelUpdatableInterface,
} from './domain/interfaces/user-metadata.interface';
import { RocketsModule } from './rockets.module';
import { e2eAuthBootstrap } from './__fixtures__/providers/e2e-auth-bootstrap.fixture';

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

@ApiTags('guard-e2e-open')
@Controller('guard-e2e-open')
class GuardE2eOpenController {
  @Get()
  @ApiOkResponse({ description: 'Health ping' })
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

  const baseOptions: RocketsOptions = {
    settings: {},
    auth: e2eAuthBootstrap(ServerAuthAdapterFixture),
    userMetadata: {
      entity: StubUserMetadataEntity,
      createDto: GuardE2eMetadataCreateDto,
      updateDto: GuardE2eMetadataUpdateDto,
    },
    repository: E2eFakeRepositoryModule,
  };

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('registers global AuthServerGuard by default so anonymous requests are rejected', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [GuardE2eOpenModule, RocketsModule.forRoot(baseOptions)],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/guard-e2e-open')
      .expect(401);

    expect(res.body).toMatchObject({
      message: 'Authentication failed',
      statusCode: 401,
    });
  });

  it('does not register APP_GUARD when enableGlobalGuard is false', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
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
