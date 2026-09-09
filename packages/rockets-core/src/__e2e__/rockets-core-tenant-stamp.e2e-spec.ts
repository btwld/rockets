/**
 * Real-DB proof for `TenantStampHook` (issue #69 review, M2/M3).
 *
 * `TenantScopeHook` only rewrites `where` clauses. On its own it does not
 * stop an actor writing another tenant's id INTO the tenant column, so a
 * `PATCH` can move the actor's own row out of their tenant, and a `POST`
 * can plant a row in someone else's.
 *
 * Both resources below share one app and one resolver. `/loose` wires the
 * scope hook only — its two tests pin the limitation HONESTLY, so the
 * docs claiming it can never happen would fail here. `/strict` adds
 * `TenantStampHook` and is the shipped answer.
 *
 * The pair is deliberate: without the `/loose` half, `/strict` passing
 * would not prove the stamp hook is what does the work.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { withOpenApi } from '@concepta/nestjs-core';
import request from 'supertest';
import { z } from 'zod';

import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import type { Actor } from '../domain/interfaces/actor.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { RocketsCoreExceptionsFilter } from '../infrastructure/filters/exceptions.filter';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';
import { defineResource } from '../infrastructure/resource/define-resource';
import { TenantScopeHook } from '../infrastructure/hooks/tenant-scope.hook';
import { TenantStampHook } from '../infrastructure/hooks/tenant-stamp.hook';

@Entity('tenant_stamp_loose')
class LooseEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) shelterId!: string;
}

@Entity('tenant_stamp_strict')
class StrictEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) shelterId!: string;
}

const createSchema = withOpenApi(
  z.object({ name: z.string(), shelterId: z.string().optional() }),
  'TenantStampCreateDto',
);
const updateSchema = withOpenApi(
  z.object({ name: z.string().optional(), shelterId: z.string().optional() }),
  'TenantStampUpdateDto',
);
const responseSchema = withOpenApi(
  z.object({ id: z.uuid(), name: z.string(), shelterId: z.string() }),
  'TenantStampResponseDto',
);

@Injectable()
class MultiUserAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'u1' || token === 'u2' || token === 'u3') {
      return { matched: true, user: { id: token, sub: token } };
    }
    return { matched: true, error: new UnauthorizedException() };
  }
}

/** u3 belongs to two shelters; u1 and u2 to one each. */
const SHELTER_MEMBERSHIP: Readonly<Record<string, readonly string[]>> = {
  u1: ['shelter-1'],
  u2: ['shelter-2'],
  u3: ['shelter-1', 'shelter-3'],
};

const shelterScope = {
  tenantKey: 'shelterId' as const,
  resolve: (actor: Actor): readonly string[] =>
    SHELTER_MEMBERSHIP[actor.id] ?? [],
};

const looseResource = defineResource<LooseEntity>({
  key: 'loose',
  entity: LooseEntity,
  path: 'loose',
  tags: ['Loose'],
  // Scope only — the state of the world before this fix.
  hooks: [TenantScopeHook.for<LooseEntity>(LooseEntity, shelterScope)],
  operations: {
    read: { output: responseSchema },
    create: { input: createSchema, output: responseSchema },
    update: { input: updateSchema, output: responseSchema },
  },
});

const strictResource = defineResource<StrictEntity>({
  key: 'strict',
  entity: StrictEntity,
  path: 'strict',
  tags: ['Strict'],
  hooks: [
    TenantScopeHook.for<StrictEntity>(StrictEntity, shelterScope),
    TenantStampHook.for<StrictEntity>(StrictEntity, shelterScope),
  ],
  operations: {
    read: { output: responseSchema },
    create: { input: createSchema, output: responseSchema },
    update: { input: updateSchema, output: responseSchema },
  },
});

describe('TenantStampHook — tenant column on writes (issue #69 review)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [LooseEntity, StrictEntity],
          synchronize: true,
          dropSchema: true,
        }),
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(MultiUserAuthAdapter),
          providers: [MultiUserAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [looseResource, strictResource],
          global: true,
        }),
      ],
      providers: [
        { provide: APP_GUARD, useClass: AuthServerGuard },
        // Required for a hook's HttpException to keep its status: the
        // upstream membrane wraps hook throws in `RepositoryQueryException`,
        // and this filter is what walks the chain back to the 4xx.
        { provide: APP_FILTER, useClass: RocketsCoreExceptionsFilter },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const create = async (
    path: string,
    token: string,
    body: Record<string, unknown>,
    status = 201,
  ): Promise<{ id: string; shelterId: string }> => {
    const res = await request(app.getHttpServer())
      .post(`/${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(status);
    return res.body;
  };

  describe('scope hook ALONE does not protect the tenant column (documented limitation)', () => {
    it('lets a PATCH move the row into a shelter the actor does not belong to', async () => {
      const row = await create('loose', 'u1', {
        name: 'Rex',
        shelterId: 'shelter-1',
      });

      await request(app.getHttpServer())
        .patch(`/loose/${row.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ shelterId: 'shelter-2' })
        .expect(200);

      // The row is gone from u1's scope and now sits in u2's.
      await request(app.getHttpServer())
        .get(`/loose/${row.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(404);

      await request(app.getHttpServer())
        .get(`/loose/${row.id}`)
        .set('Authorization', 'Bearer u2')
        .expect(200);
    });

    it('lets a POST plant a row directly in another shelter', async () => {
      const row = await create('loose', 'u1', {
        name: 'Planted',
        shelterId: 'shelter-2',
      });
      expect(row.shelterId).toBe('shelter-2');
    });
  });

  describe('scope + stamp closes it', () => {
    it("rejects a PATCH that would move the row out of the actor's shelters", async () => {
      const row = await create('strict', 'u1', {
        name: 'Rex',
        shelterId: 'shelter-1',
      });

      await request(app.getHttpServer())
        .patch(`/strict/${row.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ shelterId: 'shelter-2' })
        .expect(403);

      // Still where it started, still visible to its owner.
      const after = await request(app.getHttpServer())
        .get(`/strict/${row.id}`)
        .set('Authorization', 'Bearer u1')
        .expect(200);
      expect(after.body.shelterId).toBe('shelter-1');
    });

    it('rejects a POST into another shelter', async () => {
      await create('strict', 'u1', { name: 'X', shelterId: 'shelter-2' }, 403);
    });

    it('allows a PATCH that only touches non-tenant fields', async () => {
      const row = await create('strict', 'u1', {
        name: 'Before',
        shelterId: 'shelter-1',
      });

      const res = await request(app.getHttpServer())
        .patch(`/strict/${row.id}`)
        .set('Authorization', 'Bearer u1')
        .send({ name: 'After' })
        .expect(200);

      expect(res.body.name).toBe('After');
      expect(res.body.shelterId).toBe('shelter-1');
    });

    it('stamps the only shelter when a POST omits the tenant column', async () => {
      const row = await create('strict', 'u1', { name: 'Implicit' });
      expect(row.shelterId).toBe('shelter-1');
    });

    it('400s a POST that omits the tenant column for a multi-shelter actor', async () => {
      await create('strict', 'u3', { name: 'Ambiguous' }, 400);
    });

    it('allows a multi-shelter actor to move a row between their OWN shelters', async () => {
      const row = await create('strict', 'u3', {
        name: 'Movable',
        shelterId: 'shelter-1',
      });

      const res = await request(app.getHttpServer())
        .patch(`/strict/${row.id}`)
        .set('Authorization', 'Bearer u3')
        .send({ shelterId: 'shelter-3' })
        .expect(200);

      expect(res.body.shelterId).toBe('shelter-3');
    });
  });
});
