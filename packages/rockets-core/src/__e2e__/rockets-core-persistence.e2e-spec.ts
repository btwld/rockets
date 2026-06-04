/**
 * E2E test for the top-level `repository` adapter and feature-bundle
 * persistence wiring on `RocketsCoreModule`.
 *
 * Validates that:
 *  - `extras.repository` registers the user-metadata entity through
 *    `RepositoryModule.forFeature`.
 *  - `defineModuleResource({ entities: [...] })` rows are folded into the
 *    same registration plan as CRUD bundles.
 *  - CQRS handlers can resolve the registered repositories.
 */
import {
  Global,
  INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { RepositoryModuleInterface } from '@bitwild/rockets-repository';
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { defineModuleResource } from '../infrastructure/resource/define-module-resource';
import { UpsertUserMetadataCommand } from '../application/commands/impl/upsert-user-metadata.command';
import { GetUserMetadataQuery } from '../application/queries/impl/get-user-metadata.query';
import { createStubAuthBootstrap } from '../infrastructure/auth/create-stub-auth-bootstrap';
import type {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '../domain/interfaces/user-metadata.interface';

// ────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────

@Injectable()
class MockAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'valid')
      return { matched: true, user: { id: 'u1', sub: 'u1' } };
    return { matched: true, error: new UnauthorizedException() };
  }
}

class InMemoryMetadataRepo {
  private store = new Map<string, Record<string, unknown>>();
  private counter = 0;

  async findOne(options: {
    where: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null> {
    const where = options.where;
    const field = (where as Record<string, unknown>)['field'] as
      | string
      | undefined;
    const value = (where as Record<string, unknown>)['value'] as
      | string
      | undefined;
    if (field === 'userId' && value) {
      for (const entry of this.store.values()) {
        if (entry['userId'] === value) return entry;
      }
    }
    return null;
  }

  async create(
    data: Partial<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const id = `meta-${++this.counter}`;
    const record = {
      id,
      dateCreated: new Date(),
      dateUpdated: new Date(),
      dateDeleted: null,
      version: 1,
      ...data,
    };
    this.store.set(id, record);
    return record;
  }

  async update(
    existing: Record<string, unknown>,
    data: Partial<Record<string, unknown>>,
  ): Promise<Record<string, unknown>> {
    const updated = { ...existing, ...data, dateUpdated: new Date() };
    this.store.set(existing['id'] as string, updated);
    return updated;
  }
}

class InMemoryExtraRepo {
  async findOne(): Promise<null> {
    return null;
  }
}

/**
 * Fake repository adapter module that provides in-memory repositories.
 * Mimics the contract of TypeOrmRepositoryModule without a database.
 */
const FakeRepositoryModule: RepositoryModuleInterface = {
  name: 'FakeRepositoryModule',
  forFeature(entities) {
    const providers = entities.map((e) => ({
      provide: getDynamicRepositoryToken(e.key),
      useValue:
        e.key === USER_METADATA_MODULE_ENTITY_KEY
          ? new InMemoryMetadataRepo()
          : new InMemoryExtraRepo(),
    }));

    @Global()
    @Module({ providers, exports: providers.map((p) => p.provide) })
    class FakeRepoFeatureModule {}

    return {
      module: FakeRepoFeatureModule,
      providers,
      exports: providers.map((p) => p.provide),
    };
  },
};

class UserMetadataEntity {}
class AuditEntity {}

class CoreE2eUserMetadataCreateDto implements UserMetadataCreatableInterface {
  userId!: string;
}

class CoreE2eUserMetadataUpdateDto
  implements UserMetadataModelUpdatableInterface
{
  id!: string;
}

const coreE2eUserMetadataConfig = {
  entity: UserMetadataEntity,
  createDto: CoreE2eUserMetadataCreateDto,
  updateDto: CoreE2eUserMetadataUpdateDto,
} as const;

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe('RocketsCoreModule — top-level repository + module resources (e2e)', () => {
  let app: INestApplication;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('registers userMetadata repo from the top-level `repository` adapter', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: createStubAuthBootstrap(MockAuthAdapter),
          providers: [MockAuthAdapter],
          userMetadata: coreE2eUserMetadataConfig,
          repository: FakeRepositoryModule,
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const metadataRepo = app.get(
      getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
    );
    expect(metadataRepo).toBeDefined();
    expect(metadataRepo).toHaveProperty('findOne');

    const commandBus = app.get(CommandBus);
    const result = await commandBus.execute(
      new UpsertUserMetadataCommand('test-user', { firstName: 'Test' }),
    );
    expect(result).toHaveProperty('userId', 'test-user');
  });

  it('registers additional entities via a defineModuleResource bundle', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: createStubAuthBootstrap(MockAuthAdapter),
          providers: [MockAuthAdapter],
          userMetadata: coreE2eUserMetadataConfig,
          repository: FakeRepositoryModule,
          resources: [
            defineModuleResource({
              entities: [{ key: 'audit', entity: AuditEntity }],
            }),
          ],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const metadataRepo = app.get(
      getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
    );
    expect(metadataRepo).toBeDefined();

    const auditRepo = app.get(getDynamicRepositoryToken('audit'));
    expect(auditRepo).toBeDefined();
    expect(auditRepo).toHaveProperty('findOne');
  });

  it('GetUserMetadataQuery works against the registered repo', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: createStubAuthBootstrap(MockAuthAdapter),
          providers: [MockAuthAdapter],
          userMetadata: coreE2eUserMetadataConfig,
          repository: FakeRepositoryModule,
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const commandBus = app.get(CommandBus);
    const queryBus = app.get(QueryBus);

    await commandBus.execute(
      new UpsertUserMetadataCommand('query-user', { bio: 'hello' }),
    );

    const result = await queryBus.execute(
      new GetUserMetadataQuery('query-user'),
    );
    expect(result).toHaveProperty('userId', 'query-user');
  });
});
