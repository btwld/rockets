import { vi, describe, it, expect } from 'vitest';
import {
  Global,
  Injectable,
  Module,
  UnauthorizedException,
  type DynamicModule,
  type Type,
  type PlainLiteralObject,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  DynamicRepositoryModule,
  RepositoryProviderOptions,
} from '@concepta/nestjs-repository';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { withOpenApi } from '@concepta/nestjs-core';
import { z } from 'zod';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import type { RepositoryBootstrap } from '../domain/interfaces/repository-bootstrap.interface';
import { RocketsCoreModule } from '../rockets-core.module';
import { defineModuleResource } from '../infrastructure/resource/define-module-resource';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';

// ────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────

@Injectable()
class StubAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    return { matched: true, error: new UnauthorizedException() };
  }
}

class WidgetEntity {
  id!: string;
}

class GadgetEntity {
  id!: string;
}

class AnalyticsEntity {
  id!: string;
}

class StubMetadataEntity {
  id!: string;
}

const stubMetadataUpdateSchema = withOpenApi(
  z.object({}),
  'StubMetadataUpdateDto',
);

const stubMetadataResponseSchema = withOpenApi(
  z.object({ id: z.string(), userId: z.string() }),
  'StubMetadataResponseDto',
);

class InMemoryRepoStub {
  async findOne() {
    return null;
  }
}

/**
 * Build a fresh fake bootstrap and a sibling alt adapter for each test.
 *
 * - The bootstrap implements `RepositoryBootstrap` with `forRoot` and
 *   `forFeature` as vi spies. `forFeature` registers each entity's
 *   `DYNAMIC_REPOSITORY_TOKEN_<key>` with a stub repo so upstream
 *   `RepositoryModule.forFeature(...)` can wire its registration token.
 * - The alt adapter is plain `RepositoryModuleInterface` — used to
 *   prove that entities under per-entity overrides are excluded from
 *   the bootstrap's `forRoot` call.
 */
function buildAdapterDynamicModule(
  entities: RepositoryProviderOptions[],
  ownerName: string,
): DynamicRepositoryModule {
  const providers = entities.map((e) => ({
    provide: getDynamicRepositoryToken(e.key),
    useValue: new InMemoryRepoStub(),
  }));

  @Global()
  @Module({
    providers,
    exports: providers.map((p) => p.provide),
  })
  // Anonymous host class — name only matters in the DI error path.
  class FakeRepoFeatureModule {}
  Object.defineProperty(FakeRepoFeatureModule, 'name', {
    value: `${ownerName}FeatureModule`,
  });

  return {
    module: FakeRepoFeatureModule,
    providers,
    exports: providers.map((p) => p.provide),
  };
}

function createFixture() {
  @Global()
  @Module({})
  class NoopRootModule {}

  const forFeature = vi.fn(
    (entities: RepositoryProviderOptions[]): DynamicRepositoryModule =>
      buildAdapterDynamicModule(entities, 'BootstrapAdapter'),
  );

  const forRoot = vi.fn(
    (_entities: ReadonlyArray<Type<PlainLiteralObject>>): DynamicModule => ({
      module: NoopRootModule,
      providers: [],
      exports: [],
    }),
  );

  const fakeBootstrap: RepositoryBootstrap = {
    name: 'fake-bootstrap',
    forFeature,
    forRoot,
  };

  const altForFeature = vi.fn(
    (entities: RepositoryProviderOptions[]): DynamicRepositoryModule =>
      buildAdapterDynamicModule(entities, 'AltAdapter'),
  );

  const altAdapter = {
    name: 'alt-adapter',
    forFeature: altForFeature,
  };

  const metadataConfig = {
    entity: StubMetadataEntity,
    updateSchema: stubMetadataUpdateSchema,
    responseSchema: stubMetadataResponseSchema,
  };

  return {
    fakeBootstrap,
    forRoot,
    forFeature,
    altAdapter,
    altForFeature,
    metadataConfig,
  };
}

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe('RocketsCoreModule — RepositoryBootstrap.forRoot wiring (e2e)', () => {
  it('calls `repository.forRoot(entities)` exactly once at boot', async () => {
    const { fakeBootstrap, forRoot, metadataConfig } = createFixture();

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          repository: fakeBootstrap,
          userMetadata: metadataConfig,
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();

    expect(forRoot).toHaveBeenCalledTimes(1);
  });

  it('forwards every entity registered through `resources[]` and `userMetadata` to `forRoot`', async () => {
    const { fakeBootstrap, forRoot, metadataConfig } = createFixture();

    // Pure persistence bundles — CRUD is unnecessary here, what we
    // validate is the entity contribution to the bootstrap call.
    const widgetFeature = defineModuleResource({ entities: [WidgetEntity] });
    const gadgetFeature = defineModuleResource({ entities: [GadgetEntity] });

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          repository: fakeBootstrap,
          userMetadata: metadataConfig,
          resources: [widgetFeature, gadgetFeature],
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();

    expect(forRoot).toHaveBeenCalledTimes(1);
    const [entitiesArg] = forRoot.mock.calls[0];
    expect(entitiesArg).toEqual(
      expect.arrayContaining([WidgetEntity, GadgetEntity, StubMetadataEntity]),
    );
    expect(entitiesArg).toHaveLength(3);
  });

  it('excludes entities whose bundle declares a per-entity adapter override (mixed-store apps)', async () => {
    const { fakeBootstrap, forRoot, altAdapter, metadataConfig } =
      createFixture();

    const widgetFeature = defineModuleResource({ entities: [WidgetEntity] });
    // Analytics lives on a different adapter (e.g. Firestore in real apps)
    // — its row must NOT be passed to the bootstrap's `forRoot`.
    const analyticsFeature = defineModuleResource({
      entities: [
        {
          key: 'analytics',
          entity: AnalyticsEntity,
          repository: altAdapter,
        },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          repository: fakeBootstrap,
          userMetadata: metadataConfig,
          resources: [widgetFeature, analyticsFeature],
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();

    expect(forRoot).toHaveBeenCalledTimes(1);
    const [entitiesArg] = forRoot.mock.calls[0];
    expect(entitiesArg).toEqual(
      expect.arrayContaining([WidgetEntity, StubMetadataEntity]),
    );
    expect(entitiesArg).not.toContain(AnalyticsEntity);
    expect(entitiesArg).toHaveLength(2);
  });

  it('calls `forRoot` on a per-entity RepositoryBootstrap override (mixed-store Firestore)', async () => {
    const { fakeBootstrap, forRoot, metadataConfig } = createFixture();

    @Global()
    @Module({})
    class AltRootModule {}

    const altForRoot = vi.fn(
      (_entities: ReadonlyArray<Type<PlainLiteralObject>>): DynamicModule => ({
        module: AltRootModule,
        global: true,
      }),
    );

    const firestoreBootstrap: RepositoryBootstrap = {
      name: 'firestore-bootstrap',
      forFeature: vi.fn(
        (entities: RepositoryProviderOptions[]): DynamicRepositoryModule =>
          buildAdapterDynamicModule(entities, 'FirestoreBootstrap'),
      ),
      forRoot: altForRoot,
    };

    const widgetFeature = defineModuleResource({ entities: [WidgetEntity] });
    const analyticsFeature = defineModuleResource({
      entities: [
        {
          key: 'analytics',
          entity: AnalyticsEntity,
          repository: firestoreBootstrap,
        },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          repository: fakeBootstrap,
          userMetadata: metadataConfig,
          resources: [widgetFeature, analyticsFeature],
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();

    expect(forRoot).toHaveBeenCalledTimes(1);
    expect(altForRoot).toHaveBeenCalledTimes(1);
    expect(altForRoot).toHaveBeenCalledWith([AnalyticsEntity]);
  });

  it('does NOT call `forRoot` when the root adapter is a plain `RepositoryModuleInterface` (no bootstrap method)', async () => {
    const { altAdapter, altForFeature, metadataConfig } = createFixture();

    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(StubAuthAdapter),
          repository: altAdapter,
          userMetadata: metadataConfig,
        }),
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();

    expect(altForFeature).toHaveBeenCalled();
    // No `forRoot` exists on the plain adapter — nothing to assert beyond
    // the absence of a TypeError, which a passing boot already proves.
  });
});
