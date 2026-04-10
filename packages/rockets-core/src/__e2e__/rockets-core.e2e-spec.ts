import {
  INestApplication,
  Controller,
  Get,
  Global,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import request from 'supertest';
import { getDynamicRepositoryToken } from '@bitwild/rockets-repository';
import type { AuthProviderInterface } from '../domain/interfaces/auth-provider.interface';
import type { AuthorizedUser } from '../domain/interfaces/auth-user.interface';
import { RocketsCoreModule } from '../rockets-core.module';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { AuthPublic } from '../decorators/auth-public.decorator';
import {
  AUTH_PROVIDER_TOKEN,
  USER_METADATA_MODULE_ENTITY_KEY,
} from '../rockets-core.constants';
import { UpsertUserMetadataCommand } from '../application/commands/impl/upsert-user-metadata.command';
import { GetUserMetadataQuery } from '../application/queries/impl/get-user-metadata.query';
import { AuthUser } from '@bitwild/rockets-common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

// ────────────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────────────

@Injectable()
class MockAuthProvider implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    if (token === 'valid') {
      return {
        id: 'u1',
        sub: 'u1',
        email: 'a@b.com',
        userRoles: [{ role: { name: 'admin' } }],
      };
    }
    if (token === 'throws-generic') {
      throw new Error('generic error');
    }
    throw new UnauthorizedException('bad token');
  }
}

/** In-memory Map-based repository for userMetadata */
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
    // Plain object where
    if (where['userId']) {
      for (const entry of this.store.values()) {
        if (entry['userId'] === where['userId']) return entry;
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

// ────────────────────────────────────────────────────────────────────
// Test Controllers
// ────────────────────────────────────────────────────────────────────

const metadataRepoToken = getDynamicRepositoryToken(
  USER_METADATA_MODULE_ENTITY_KEY,
);

@Global()
@Module({
  providers: [
    { provide: metadataRepoToken, useValue: new InMemoryMetadataRepo() },
  ],
  exports: [metadataRepoToken],
})
class TestMetadataRepoModule {}

@ApiTags('test')
@Controller('test')
class TestController {
  @Get('protected')
  @ApiOkResponse({ description: 'Protected route ping' })
  getProtected() {
    return { ok: true };
  }

  @Get('public')
  @AuthPublic()
  @ApiOkResponse({ description: 'Public route ping' })
  getPublic() {
    return { message: 'public' };
  }

  @Get('user')
  @ApiOkResponse({ description: 'Authenticated user info' })
  getUser(@AuthUser() user: AuthorizedUser) {
    return user;
  }
}

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe('RocketsCoreModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TestMetadataRepoModule,
        RocketsCoreModule.forRoot({
          authProvider: new MockAuthProvider(),
          global: true,
        }),
      ],
      controllers: [TestController],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('AuthServerGuard', () => {
    it('allows access with valid token', () =>
      request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Bearer valid')
        .expect(200)
        .expect({ ok: true }));

    it('rejects without token', () =>
      request(app.getHttpServer()).get('/test/protected').expect(401));

    it('rejects with invalid token', () =>
      request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Bearer bad')
        .expect(401));

    it('rejects with non-Bearer auth', () =>
      request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Basic abc')
        .expect(401));

    it('rejects when provider throws generic error (wraps as 401)', () =>
      request(app.getHttpServer())
        .get('/test/protected')
        .set('Authorization', 'Bearer throws-generic')
        .expect(401));
  });

  describe('@AuthPublic', () => {
    it('allows access without token', () =>
      request(app.getHttpServer())
        .get('/test/public')
        .expect(200)
        .expect({ message: 'public' }));
  });

  describe('@AuthUser decorator', () => {
    it('injects the authenticated user', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/user')
        .set('Authorization', 'Bearer valid')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'u1',
        sub: 'u1',
        email: 'a@b.com',
      });
    });
  });

  describe('CQRS Handlers', () => {
    it('UpsertUserMetadataCommand creates metadata', async () => {
      const commandBus = app.get(CommandBus);
      const result = await commandBus.execute(
        new UpsertUserMetadataCommand('user-99', { firstName: 'Test' }),
      );
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('userId', 'user-99');
    });

    it('GetUserMetadataQuery returns null for unknown user', async () => {
      const queryBus = app.get(QueryBus);
      const result = await queryBus.execute(
        new GetUserMetadataQuery('nonexistent'),
      );
      expect(result).toBeNull();
    });

    it('GetUserMetadataQuery returns metadata for known user', async () => {
      const commandBus = app.get(CommandBus);
      const queryBus = app.get(QueryBus);

      await commandBus.execute(
        new UpsertUserMetadataCommand('user-100', { bio: 'hello' }),
      );

      const result = await queryBus.execute(
        new GetUserMetadataQuery('user-100'),
      );
      expect(result).toHaveProperty('userId', 'user-100');
    });

    it('UpsertUserMetadataCommand updates existing metadata', async () => {
      const commandBus = app.get(CommandBus);

      await commandBus.execute(
        new UpsertUserMetadataCommand('user-101', { firstName: 'Old' }),
      );
      const updated = await commandBus.execute(
        new UpsertUserMetadataCommand('user-101', { firstName: 'New' }),
      );
      expect(updated).toHaveProperty('userId', 'user-101');
    });
  });

  describe('Module exports', () => {
    it('AUTH_PROVIDER_TOKEN is resolvable', () => {
      const provider = app.get(AUTH_PROVIDER_TOKEN);
      expect(provider).toBeDefined();
      expect(provider).toHaveProperty('validateToken');
    });

    it('AuthServerGuard is resolvable', () => {
      const guard = app.get(AuthServerGuard);
      expect(guard).toBeDefined();
      expect(guard).toHaveProperty('canActivate');
    });
  });
});
