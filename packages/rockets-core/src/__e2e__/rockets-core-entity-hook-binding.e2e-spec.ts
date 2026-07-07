/**
 * E2E coverage for the `@EntityHook({ entity })` runtime invariant.
 *
 * Two failure modes are guarded:
 *
 *  1. **Self-recursion.** A hook whose `afterCreate` body writes to a
 *     different* entity (canonical: audit log) must NOT re-trigger
 *     itself on that nested write. Without the entity-binding spec, the
 *     forwarded `ctx` carries the parent's `HooksCtx` and the resolver
 *     re-invokes the same hook → unbounded recursion → heap OOM.
 *
 *  2. **Cross-entity firing.** A hook bound to entity A must NOT fire
 *     for operations whose ctx targets a different entity B — even if
 *     the hook is globally registered as a provider. The spec applied
 *     by `@EntityHook({ entity: A })` is `RepoSpec.isEntity(<A-key>)`,
 *     which the resolver consults per invocation.
 */
import {
  Global,
  INestApplication,
  Injectable,
  Module,
  type PlainLiteralObject,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import {
  type RepositoryInterface,
  getDynamicRepositoryToken,
} from '@concepta/nestjs-repository';
import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import request from 'supertest';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineResource } from '../infrastructure/resource/define-resource';
import { defineModuleResource } from '../infrastructure/resource/define-module-resource';
import { createStubAuthBootstrap } from '../infrastructure/auth/create-stub-auth-bootstrap';
import { InjectDynamicRepository } from '../common';
import {
  EntityHook,
  type EntityHookContext,
  PassthroughEntityHookBase,
} from '../infrastructure/hooks/entity-hook';

// ── Auth fixture ──

@Injectable()
class StubAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'u1') return { matched: true, user: { id: 'u1', sub: 'u1' } };
    return { matched: true, error: new UnauthorizedException() };
  }
}

// ── Entities ──

@Entity('widgets')
class WidgetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
}

@Entity('gadgets')
class GadgetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
}

@Entity('widget_logs')
class WidgetLogEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) widgetId!: string;
}

// ── DTOs ──

class WidgetCreateDto {
  @Expose() @IsString() @ApiProperty() name!: string;
}

class WidgetResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
}

class GadgetCreateDto {
  @Expose() @IsString() @ApiProperty() name!: string;
}

class GadgetResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
}

// ── Hooks — entity-bound at runtime ──

// Counters live on the class so the test can assert exact fire counts.
class FireCounter {
  static widgetAfterCreate = 0;
  static widgetBeforeCreate = 0;
  static gadgetAfterCreate = 0;
  static reset(): void {
    FireCounter.widgetAfterCreate = 0;
    FireCounter.widgetBeforeCreate = 0;
    FireCounter.gadgetAfterCreate = 0;
  }
}

/**
 * Hook bound to `WidgetEntity`. Its `afterCreate` writes a row to
 * `widget_logs` and forwards the parent ctx — exactly the recursion
 * pattern that motivates the entity-binding spec. With the binding in
 * place, the nested write targets `widgetLog`, the spec
 * `isEntity('widget')` rejects it, and the hook does NOT recurse.
 */
@EntityHook({ entity: WidgetEntity })
@Injectable()
class WidgetLoggerHook extends PassthroughEntityHookBase<WidgetEntity> {
  constructor(
    @InjectDynamicRepository(WidgetLogEntity)
    private readonly logRepo: RepositoryInterface<WidgetLogEntity>,
  ) {
    super();
  }

  override beforeCreate(
    payload: WidgetEntity,
    _ctx?: EntityHookContext,
  ): WidgetEntity {
    FireCounter.widgetBeforeCreate += 1;
    return payload;
  }

  override async afterCreate(
    result: WidgetEntity,
    ctx?: EntityHookContext,
  ): Promise<WidgetEntity> {
    FireCounter.widgetAfterCreate += 1;
    await this.logRepo.create({ widgetId: result.id }, { ctx });
    return result;
  }
}

/**
 * Hook bound to `GadgetEntity` — used as the negative cross-entity
 * control. Must fire only on gadget operations, never on widget ones.
 */
@EntityHook({ entity: GadgetEntity })
@Injectable()
class GadgetCounterHook extends PassthroughEntityHookBase<GadgetEntity> {
  override afterCreate(
    result: GadgetEntity,
    _ctx?: EntityHookContext,
  ): GadgetEntity {
    FireCounter.gadgetAfterCreate += 1;
    return result;
  }
}

// ── User-metadata stub ──

class StubMetadataRepo {
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
  providers: [{ provide: metaToken, useValue: new StubMetadataRepo() }],
  exports: [metaToken],
})
class MetaModule {}

// ── Resources ──

const widgetResource = defineResource<WidgetEntity>({
  key: 'widget',
  entity: WidgetEntity,
  path: 'widgets',
  tags: ['Widgets'],
  hooks: [WidgetLoggerHook],
  operations: {
    create: { input: WidgetCreateDto, output: WidgetResponseDto },
    list: { output: WidgetResponseDto },
  },
});

const gadgetResource = defineResource<GadgetEntity>({
  key: 'gadget',
  entity: GadgetEntity,
  path: 'gadgets',
  tags: ['Gadgets'],
  hooks: [GadgetCounterHook],
  operations: {
    create: { input: GadgetCreateDto, output: GadgetResponseDto },
    list: { output: GadgetResponseDto },
  },
});

const widgetLogFeature = defineModuleResource({
  entities: [{ key: 'widgetLog', entity: WidgetLogEntity }],
});

// ── Spec ──

describe('@EntityHook({ entity }) — runtime binding (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [WidgetEntity, GadgetEntity, WidgetLogEntity],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: createStubAuthBootstrap(StubAuthAdapter),
          providers: [StubAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [widgetResource, gadgetResource, widgetLogFeature],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    FireCounter.reset();
    // SQLite is in-memory and persists across tests in the same Nest
    // instance — clear the log table so per-test row counts are exact.
    const logRepo = app.get<RepositoryInterface<WidgetLogEntity>>(
      getDynamicRepositoryToken('widgetLog'),
    );
    const rows = (await logRepo.find({})) as WidgetLogEntity[];
    if (rows.length > 0) {
      await logRepo.deleteMany(rows);
    }
  });

  describe('self-recursion guard (the AuditLogHook footgun)', () => {
    it('POST /widgets returns 201 (no hang / no OOM)', async () => {
      const res = await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'gear' })
        .expect(201);

      expect(res.body).toMatchObject({ name: 'gear' });
      expect(typeof res.body.id).toBe('string');
    });

    it('WidgetLoggerHook.afterCreate fires exactly once per POST /widgets', async () => {
      await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'a' })
        .expect(201);

      // Without entity binding the forwarded `ctx` would trigger
      // unbounded re-entry and the count would explode (or the request
      // would never return). Exact-1 proves the spec rejects the
      // nested log write.
      expect(FireCounter.widgetAfterCreate).toBe(1);
    });

    it('two POSTs produce two WidgetLoggerHook fires (linear, not exponential)', async () => {
      await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'c1' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'c2' })
        .expect(201);

      // Linear in the number of POSTs. Any recursion would push this
      // above 2 (or hang the test before assertion).
      expect(FireCounter.widgetAfterCreate).toBe(2);
      expect(FireCounter.widgetBeforeCreate).toBe(2);
    });
  });

  describe('cross-entity isolation', () => {
    it('WidgetLoggerHook does NOT fire on POST /gadgets', async () => {
      await request(app.getHttpServer())
        .post('/gadgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'g1' })
        .expect(201);

      expect(FireCounter.gadgetAfterCreate).toBe(1);
      expect(FireCounter.widgetAfterCreate).toBe(0);
      expect(FireCounter.widgetBeforeCreate).toBe(0);
    });

    it('GadgetCounterHook does NOT fire on POST /widgets', async () => {
      await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'w-not-gadget' })
        .expect(201);

      expect(FireCounter.widgetAfterCreate).toBe(1);
      expect(FireCounter.gadgetAfterCreate).toBe(0);
    });

    it('alternating writes keep each hook count perfectly partitioned by entity', async () => {
      await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'w' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/gadgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'g' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'w' })
        .expect(201);

      expect(FireCounter.widgetAfterCreate).toBe(2);
      expect(FireCounter.gadgetAfterCreate).toBe(1);
    });
  });

  describe('log row persistence (proves the inner write actually committed)', () => {
    it('the log table contains exactly one row per POST /widgets', async () => {
      await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'logged-1' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/widgets')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'logged-2' })
        .expect(201);

      const logRepo = app.get<RepositoryInterface<WidgetLogEntity>>(
        getDynamicRepositoryToken('widgetLog'),
      );
      const rows = (await logRepo.find({})) as PlainLiteralObject[];
      expect(rows.length).toBe(2);
    });
  });
});
