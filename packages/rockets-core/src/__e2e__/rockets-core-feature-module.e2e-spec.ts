/**
 * E2E test for `defineModuleResource` integration with `RocketsCoreModule`.
 *
 * Validates:
 *  - `entities[]` rows produce resolvable `@InjectDynamicRepository(key)` tokens.
 *  - `module.providers` are instantiated with their dependencies (here, the
 *    dynamic repository registered by the same bundle).
 *  - `module.controllers` are mounted by Nest.
 *  - Per-entity `repository` override creates a separate adapter group.
 */
import {
  Controller,
  Get,
  Global,
  INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import {
  getDynamicRepositoryToken,
  InjectDynamicRepository,
} from '@bitwild/rockets-repository';
import request from 'supertest';
import { RocketsCoreModule } from '../rockets-core.module';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineModuleResource } from '../infrastructure/resource/define-module-resource';
import type { AuthAdapterInterface } from '../domain/interfaces/auth-adapter.interface';
import type { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import type {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '../domain/interfaces/user-metadata.interface';

@Injectable()
class FeatureE2eAuthAdapter implements AuthAdapterInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    if (token === 'valid') return { id: 'u1', sub: 'u1' };
    throw new UnauthorizedException();
  }
}

class WidgetEntity {}

interface FakeRepoLike {
  ping(): string;
}

class FakeWidgetRepo implements FakeRepoLike {
  ping(): string {
    return 'widget-pong';
  }
}

class FakeMetadataRepo implements FakeRepoLike {
  ping(): string {
    return 'metadata-pong';
  }
}

const DEFAULT_FAKE_ADAPTER: RepositoryModuleInterface = {
  name: 'DefaultFakeAdapter',
  forFeature(entities) {
    const providers = entities.map((e) => ({
      provide: getDynamicRepositoryToken(e.key),
      useValue:
        e.key === 'widget' ? new FakeWidgetRepo() : new FakeMetadataRepo(),
    }));
    @Global()
    @Module({ providers, exports: providers.map((p) => p.provide) })
    class DefaultFakeFeatureModule {}
    return {
      module: DefaultFakeFeatureModule,
      providers,
      exports: providers.map((p) => p.provide),
    };
  },
};

class GadgetEntity {}

class FakeGadgetRepo implements FakeRepoLike {
  ping(): string {
    return 'gadget-pong';
  }
}

const ALTERNATE_FAKE_ADAPTER: RepositoryModuleInterface = {
  name: 'AlternateFakeAdapter',
  forFeature(entities) {
    const providers = entities.map((e) => ({
      provide: getDynamicRepositoryToken(e.key),
      useValue: new FakeGadgetRepo(),
    }));
    @Global()
    @Module({ providers, exports: providers.map((p) => p.provide) })
    class AlternateFakeFeatureModule {}
    return {
      module: AlternateFakeFeatureModule,
      providers,
      exports: providers.map((p) => p.provide),
    };
  },
};

@Injectable()
class WidgetService {
  constructor(
    @InjectDynamicRepository('widget') private readonly repo: FakeRepoLike,
  ) {}

  ping(): string {
    return this.repo.ping();
  }
}

@ApiTags('widgets-e2e')
@Controller('widgets')
class WidgetController {
  constructor(private readonly widgetService: WidgetService) {}

  @Get('ping')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { value: { type: 'string' } },
    },
  })
  ping(): { value: string } {
    return { value: this.widgetService.ping() };
  }
}

class FeatureMetadataCreateDto implements UserMetadataCreatableInterface {
  userId!: string;
}
class FeatureMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  id!: string;
}
class FeatureUserMetadataEntity {}

const featureUserMetadataConfig = {
  entity: FeatureUserMetadataEntity,
  createDto: FeatureMetadataCreateDto,
  updateDto: FeatureMetadataUpdateDto,
};

describe('RocketsCoreModule + defineModuleResource (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    if (app) await app.close();
  });

  it('mounts the controller, instantiates the service, and resolves the dynamic repo', async () => {
    const widgetFeature = defineModuleResource({
      entities: [{ key: 'widget', entity: WidgetEntity }],
      controllers: [WidgetController],
      providers: [WidgetService],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: FeatureE2eAuthAdapter,
          providers: [FeatureE2eAuthAdapter],
          userMetadata: featureUserMetadataConfig,
          repository: DEFAULT_FAKE_ADAPTER,
          resources: [widgetFeature],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const widgetRepo = app.get(getDynamicRepositoryToken('widget'));
    expect(widgetRepo).toBeInstanceOf(FakeWidgetRepo);

    await request(app.getHttpServer())
      .get('/widgets/ping')
      .set('Authorization', 'Bearer valid')
      .expect(200, { value: 'widget-pong' });
  });

  it('routes a per-entity `repository` override to a separate adapter group', async () => {
    const mixedFeature = defineModuleResource({
      entities: [
        { key: 'widget', entity: WidgetEntity },
        {
          key: 'gadget',
          entity: GadgetEntity,
          repository: ALTERNATE_FAKE_ADAPTER,
        },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: FeatureE2eAuthAdapter,
          providers: [FeatureE2eAuthAdapter],
          userMetadata: featureUserMetadataConfig,
          repository: DEFAULT_FAKE_ADAPTER,
          resources: [mixedFeature],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    expect(app.get(getDynamicRepositoryToken('widget'))).toBeInstanceOf(
      FakeWidgetRepo,
    );
    expect(app.get(getDynamicRepositoryToken('gadget'))).toBeInstanceOf(
      FakeGadgetRepo,
    );
  });

  it('allows a module resource with empty entities (Nest wiring only)', async () => {
    const cqrsOnly = defineModuleResource({
      entities: [],
      controllers: [WidgetController],
      providers: [WidgetService],
    });

    // WidgetService still depends on the `widget` repo, so we register it
    // through a separate sibling bundle to mirror the production pattern
    // where one bundle owns the table and others consume it.
    const widgetReposFeature = defineModuleResource({
      entities: [{ key: 'widget', entity: WidgetEntity }],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: FeatureE2eAuthAdapter,
          providers: [FeatureE2eAuthAdapter],
          userMetadata: featureUserMetadataConfig,
          repository: DEFAULT_FAKE_ADAPTER,
          resources: [widgetReposFeature, cqrsOnly],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/widgets/ping')
      .set('Authorization', 'Bearer valid')
      .expect(200, { value: 'widget-pong' });
  });
});
