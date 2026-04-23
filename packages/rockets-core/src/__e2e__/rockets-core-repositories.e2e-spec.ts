/**
 * E2E test for the `repositories` config path on RocketsCoreModule.
 *
 * Validates that `flattenRepositories` + `RepositoryModule.forFeature`
 * correctly registers the userMetadata repository when the consumer
 * passes `repositories: { module, userMetadata, entities }`.
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
import type { RepositoryModuleInterface } from '@concepta/nestjs-repository';
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';
import type { AuthProviderInterface } from '../domain/interfaces/auth-provider.interface';
import type { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import { RocketsCoreModule } from '../rockets-core.module';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { UpsertUserMetadataCommand } from '../application/commands/impl/upsert-user-metadata.command';
import { GetUserMetadataQuery } from '../application/queries/impl/get-user-metadata.query';

// ────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────

@Injectable()
class MockAuthProvider implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    if (token === 'valid') return { id: 'u1', sub: 'u1' };
    throw new UnauthorizedException();
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
 * Mimics the contract of TypeOrmRepositoryModule without needing a database.
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

// Fake entity classes
class UserMetadataEntity {}
class AuditEntity {}

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe('RocketsCoreModule — repositories config (e2e)', () => {
  let app: INestApplication;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('registers userMetadata repo via repositories config', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          authProvider: new MockAuthProvider(),
          repositories: {
            module: FakeRepositoryModule,
            userMetadata: { entity: UserMetadataEntity },
          },
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Verify the userMetadata repo token is resolvable
    const metadataRepo = app.get(
      getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
    );
    expect(metadataRepo).toBeDefined();
    expect(metadataRepo).toHaveProperty('findOne');

    // Verify CQRS handlers work (they depend on the injected repo)
    const commandBus = app.get(CommandBus);
    const result = await commandBus.execute(
      new UpsertUserMetadataCommand('test-user', { firstName: 'Test' }),
    );
    expect(result).toHaveProperty('userId', 'test-user');
  });

  it('registers additional entities via repositories.entities', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          authProvider: new MockAuthProvider(),
          repositories: {
            module: FakeRepositoryModule,
            userMetadata: { entity: UserMetadataEntity },
            entities: [{ key: 'audit', entity: AuditEntity }],
          },
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Both repos should be resolvable
    const metadataRepo = app.get(
      getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY),
    );
    expect(metadataRepo).toBeDefined();

    const auditRepo = app.get(getDynamicRepositoryToken('audit'));
    expect(auditRepo).toBeDefined();
    expect(auditRepo).toHaveProperty('findOne');
  });

  it('GetUserMetadataQuery works with repositories-registered repo', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          authProvider: new MockAuthProvider(),
          repositories: {
            module: FakeRepositoryModule,
            userMetadata: { entity: UserMetadataEntity },
          },
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const commandBus = app.get(CommandBus);
    const queryBus = app.get(QueryBus);

    // Create metadata
    await commandBus.execute(
      new UpsertUserMetadataCommand('query-user', { bio: 'hello' }),
    );

    // Query it back
    const result = await queryBus.execute(
      new GetUserMetadataQuery('query-user'),
    );
    expect(result).toHaveProperty('userId', 'query-user');
  });
});
