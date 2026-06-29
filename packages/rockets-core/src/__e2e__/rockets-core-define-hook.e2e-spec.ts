/**
 * E2E coverage for `defineHook` — the functional way to author an
 * `@EntityHook`-bound repository hook from plain lifecycle functions.
 *
 * Proves the three things the generator promises over a hand-written
 * `PassthroughEntityHookBase` subclass:
 *
 *  1. **DI toolbox.** `tools.repo` (the bound entity's dynamic repository)
 *     and `tools.actor` (the request actor) are injected and usable.
 *  2. **Merge-back on write `before*`.** Returning a NEW object from
 *     `beforeCreate` takes effect, even though the upstream membrane uses
 *     a preserve-merge where the original payload normally wins.
 *  3. **Entity binding.** The generated hook is fenced to its entity and
 *     does not fire for operations on a different one.
 */
import {
  ConflictException,
  Global,
  INestApplication,
  Injectable,
  Module,
  type PlainLiteralObject,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/nestjs-repository-typeorm';
import {
  getDynamicRepositoryToken,
  type RepositoryInterface,
  Where,
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
import { RocketsCoreExceptionsFilter } from '../infrastructure/filters/exceptions.filter';
import { defineResource } from '../infrastructure/resource/define-resource';
import { createStubAuthBootstrap } from '../infrastructure/auth/create-stub-auth-bootstrap';
import { defineHook } from '../infrastructure/hooks/define-hook';

// ── Auth fixture ──

@Injectable()
class StubAuthAdapter implements AuthAdapterInterface {
  async authenticate(req: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(req);
    if (token === null) return { matched: false };
    if (token === 'u1') return { matched: true, user: { id: 'u1', sub: 'u1' } };
    return { matched: true, error: new UnauthorizedException() };
  }
}

// ── Entities ──

@Entity('things')
class ThingEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) ref!: string;
  @Column({ type: 'varchar', nullable: true }) ownerId!: string | null;
}

@Entity('others')
class OtherEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
}

// ── DTOs ──

class ThingCreateDto {
  @Expose() @IsString() @ApiProperty() name!: string;
  @Expose() @IsString() @ApiProperty() ref!: string;
}
class ThingResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
  @Expose() @ApiProperty() ref!: string;
  @Expose() @ApiProperty() ownerId!: string | null;
}
class OtherCreateDto {
  @Expose() @IsString() @ApiProperty() name!: string;
}
class OtherResponseDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() name!: string;
}

// ── Fire counters (closed over by the functional hook) ──

const fired = { thingBefore: 0, thingAfter: 0 };
function resetFired(): void {
  fired.thingBefore = 0;
  fired.thingAfter = 0;
}

// ── The hook under test — pure functions, no class boilerplate ──

const ThingHook = defineHook<ThingEntity>(ThingEntity, {
  async beforeCreate(payload, ctx, { repo, actor }) {
    fired.thingBefore += 1;
    const ref = typeof payload.ref === 'string' ? payload.ref.trim() : '';
    if (ref) {
      const existing = await repo.findOne({
        where: Where.eq<ThingEntity>('ref', ref),
        ctx,
      });
      if (existing) {
        throw new ConflictException(`ref "${ref}" is already in use`);
      }
    }
    // Return a NEW object (not in-place mutation). The wrapper's
    // merge-back must make these stick despite the preserve-merge membrane.
    return {
      ...payload,
      name:
        typeof payload.name === 'string' ? payload.name.trim() : payload.name,
      ref,
      ownerId: actor?.id ?? null,
    };
  },
  afterCreate(entity) {
    fired.thingAfter += 1;
    return entity;
  },
});

// ── User-metadata stub (required by RocketsCoreModule) ──

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

const thingResource = defineResource<ThingEntity>({
  key: 'thing',
  entity: ThingEntity,
  path: 'things',
  tags: ['Things'],
  hooks: [ThingHook],
  operations: {
    create: { input: ThingCreateDto, output: ThingResponseDto },
    list: { output: ThingResponseDto },
  },
});

const otherResource = defineResource<OtherEntity>({
  key: 'other',
  entity: OtherEntity,
  path: 'others',
  tags: ['Others'],
  operations: {
    create: { input: OtherCreateDto, output: OtherResponseDto },
    list: { output: OtherResponseDto },
  },
});

describe('defineHook — functional entity hook (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [ThingEntity, OtherEntity],
          synchronize: true,
          dropSchema: true,
        }),
        MetaModule,
        RocketsCoreModule.forRoot({
          auth: createStubAuthBootstrap(StubAuthAdapter),
          providers: [StubAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [thingResource, otherResource],
          global: true,
        }),
      ],
      providers: [
        { provide: APP_GUARD, useClass: AuthServerGuard },
        { provide: APP_FILTER, useClass: RocketsCoreExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  beforeEach(async () => {
    resetFired();
    const repo = app.get<RepositoryInterface<ThingEntity>>(
      getDynamicRepositoryToken('thing'),
    );
    const rows = (await repo.find({})) as ThingEntity[];
    if (rows.length > 0) await repo.deleteMany(rows);
  });

  it('injects tools.repo + tools.actor and merge-back persists the returned object', async () => {
    const res = await request(app.getHttpServer())
      .post('/things')
      .set('Authorization', 'Bearer u1')
      .send({ name: '  Rex  ', ref: ' r1 ' })
      .expect(201);

    // merge-back: returning a new object from beforeCreate took effect
    expect(res.body.name).toBe('Rex');
    expect(res.body.ref).toBe('r1');
    // tools.actor: stamped from the authenticated user
    expect(res.body.ownerId).toBe('u1');
    expect(fired.thingBefore).toBe(1);
    expect(fired.thingAfter).toBe(1);
  });

  it('tools.repo uniqueness rejects a duplicate ref (409) and does not persist a second row', async () => {
    await request(app.getHttpServer())
      .post('/things')
      .set('Authorization', 'Bearer u1')
      .send({ name: 'A', ref: 'dup' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/things')
      .set('Authorization', 'Bearer u1')
      .send({ name: 'B', ref: 'dup' })
      .expect(409);

    const repo = app.get<RepositoryInterface<ThingEntity>>(
      getDynamicRepositoryToken('thing'),
    );
    const rows = (await repo.find({})) as PlainLiteralObject[];
    expect(rows.length).toBe(1);
  });

  it('entity binding: the thing hook does NOT fire on POST /others', async () => {
    await request(app.getHttpServer())
      .post('/others')
      .set('Authorization', 'Bearer u1')
      .send({ name: 'o1' })
      .expect(201);

    expect(fired.thingBefore).toBe(0);
    expect(fired.thingAfter).toBe(0);
  });
});
