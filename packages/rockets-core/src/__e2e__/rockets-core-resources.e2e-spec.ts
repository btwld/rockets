import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  INestApplication,
  Injectable,
  UnauthorizedException,
  Global,
  Module,
  Controller,
  Get,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';
import { withOpenApi } from '@concepta/nestjs-core';
import { getDynamicRepositoryToken } from '@concepta/nestjs-repository';
import { ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { z } from 'zod';
import request from 'supertest';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import {
  AUTH_ADAPTERS_TOKEN,
  USER_METADATA_MODULE_ENTITY_KEY,
} from '../rockets-core.constants';
import { APP_GUARD } from '@nestjs/core';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineResource } from '../infrastructure/resource/define-resource';
import { defineModuleResource } from '../infrastructure/resource/define-module-resource';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';

// ── Fixtures ──

@Injectable()
class SimpleAuthProvider implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'ok') return { matched: true, user: { id: 'u1', sub: 'u1' } };
    return { matched: true, error: new UnauthorizedException() };
  }
}

@Entity('widgets')
class WidgetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
}

const widgetCreateSchema = withOpenApi(
  z.object({ label: z.string() }),
  'WidgetCreateDto',
);
// Every body operation declares its schema: an unvalidated body fails the
// boot (`requireSchemaPipe`).
const widgetUpdateSchema = withOpenApi(
  z.object({ label: z.string() }).partial(),
  'WidgetUpdateDto',
);

const widgetResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), label: z.string() }),
  'WidgetResponseDto',
);

// A hand-written, non-CRUD controller mounted next to the CRUD resource below.
// Because a `defineResource` CRUD resource is present, core imports
// `CrudModule.forRoot({})`, which registers upstream's `CrudContextOverlay` as
// a global interceptor. This route has no CRUD metadata, so if the overlay ever
// stops no-op-ing on non-CRUD handlers it 500s here. This is the real removal
// guard for `SafeCrudContextInterceptor`.
@ApiTags('plain-e2e')
@Controller('plain')
class PlainController {
  @Get('ping')
  @ApiOkResponse({
    schema: { type: 'object', properties: { ok: { type: 'boolean' } } },
  })
  ping(): { ok: boolean } {
    return { ok: true };
  }
}

class InMemoryMetadataRepo {
  async findOne() {
    return null;
  }
  async create(data: Record<string, unknown>) {
    return { id: '1', ...data };
  }
  async update(e: Record<string, unknown>, d: Record<string, unknown>) {
    return { ...e, ...d };
  }
}

const metaToken = getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY);

@Global()
@Module({
  providers: [{ provide: metaToken, useValue: new InMemoryMetadataRepo() }],
  exports: [metaToken],
})
class MetaRepoModule {}

// ── Tests ──

describe('RocketsCoreModule — resources + resourcePersistence (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [WidgetEntity],
          synchronize: true,
          dropSchema: true,
        }),
        MetaRepoModule,
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(SimpleAuthProvider),
          providers: [SimpleAuthProvider],
          repository: TypeOrmRepositoryModule,
          resources: [
            defineResource({
              key: 'widget',
              entity: WidgetEntity,
              path: 'widgets',
              tags: ['Widgets'],
              dto: {
                response: widgetResponseSchema,
                create: widgetCreateSchema,
                update: widgetUpdateSchema,
              },
              providers: [SimpleAuthProvider],
            }),
            defineModuleResource({ controllers: [PlainController] }),
          ],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /widgets creates a widget via resource config', async () => {
    const res = await request(app.getHttpServer())
      .post('/widgets')
      .set('Authorization', 'Bearer ok')
      .send({ label: 'my-widget' })
      .expect(201);

    expect(res.body.label).toBe('my-widget');
  });

  it('GET /widgets lists widgets', async () => {
    const res = await request(app.getHttpServer())
      .get('/widgets')
      .set('Authorization', 'Bearer ok')
      .expect(200);

    expect(res.body).toHaveProperty('data');
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('resource providers are exported (SimpleAuthProvider)', () => {
    const provider = app.get(SimpleAuthProvider);
    expect(provider).toBeDefined();
  });

  it('serves a non-CRUD controller without a 500 when mixed with a CRUD resource', async () => {
    // The CRUD `widget` resource forced `CrudModule.forRoot({})` and its global
    // `CrudContextOverlay`; this plain route must pass through it untouched.
    const res = await request(app.getHttpServer())
      .get('/plain/ping')
      .set('Authorization', 'Bearer ok');

    expect(res.status).not.toBe(500);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

describe('RocketsCoreModule.forRootAsync (e2e)', () => {
  let app: INestApplication;

  afterAll(async () => {
    if (app) await app.close();
  });

  it('resolves AUTH_ADAPTERS_TOKEN via forRootAsync extras', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        MetaRepoModule,
        RocketsCoreModule.forRootAsync({
          useFactory: () => ({}),
          // `auth` + `providers` are sync extras (alongside useFactory).
          auth: defineAuthAdapter(SimpleAuthProvider),
          providers: [SimpleAuthProvider],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const adapters = app.get<AuthAdapterInterface[]>(AUTH_ADAPTERS_TOKEN);
    expect(adapters).toBeDefined();
    expect(Array.isArray(adapters)).toBe(true);
    expect(adapters[0]).toHaveProperty('authenticate');
  });
});
