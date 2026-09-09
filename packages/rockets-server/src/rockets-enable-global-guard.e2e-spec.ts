import { describe, it, expect, afterEach } from 'vitest';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { AUTH_ADAPTERS_TOKEN } from '@concepta/rockets-core';
import request from 'supertest';
import { E2eFakeRepositoryModule } from './__e2e__/helpers/e2e-fake-repository.module';
import { ServerAuthAdapterFixture } from './__fixtures__/providers/server-auth.adapter.fixture';
import type { RocketsOptions } from './rockets.module-definition';
import { userMetadataConfigFixture } from './__fixtures__/schemas/user-metadata.schema.fixture';
import { RocketsModule } from './rockets.module';
import { e2eAuthBootstrap } from './__fixtures__/providers/e2e-auth-bootstrap.fixture';

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
    userMetadata: userMetadataConfigFixture,
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

  it('boots an explicitly public module with no auth adapters', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        GuardE2eOpenModule,
        RocketsModule.forRoot({
          enableGlobalGuard: false,
          disableController: { me: true },
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    expect(app.get(AUTH_ADAPTERS_TOKEN)).toEqual([]);
    await request(app.getHttpServer()).get('/guard-e2e-open').expect(200, {
      ok: true,
    });
  });

  it('fails closed with the default guard when no auth adapters are configured', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        GuardE2eOpenModule,
        RocketsModule.forRoot({ disableController: { me: true } }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    expect(app.get(AUTH_ADAPTERS_TOKEN)).toEqual([]);
    await request(app.getHttpServer()).get('/guard-e2e-open').expect(401);
  });
});
