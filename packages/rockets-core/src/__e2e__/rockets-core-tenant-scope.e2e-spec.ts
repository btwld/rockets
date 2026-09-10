/**
 * Real-DB proof for TenantScopeHook (issue #69) — the shelter example
 * from the issue itself: many shelters share one API, `GET /pets` must
 * return only the caller's shelter's pets, and an actor resolving to NO
 * shelter must see nothing (fail-closed), not everything (fail-open).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  INestApplication,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
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
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';
import { defineResource } from '../infrastructure/resource/define-resource';
import { TenantScopeHook } from '../infrastructure/hooks/tenant-scope.hook';

@Entity('tenant_scope_pets')
class PetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) shelterId!: string;
}

const petCreateSchema = withOpenApi(
  z.object({ name: z.string(), shelterId: z.string() }),
  'PetCreateDto',
);
const petResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), name: z.string(), shelterId: z.string() }),
  'PetResponseDto',
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

/**
 * App-owned lookup — exactly what `resolve` in the issue's own example
 * (`shelterIdsFor(actor)`) stands in for. u3 is a member of nothing.
 */
const SHELTER_MEMBERSHIP: Readonly<Record<string, readonly string[]>> = {
  u1: ['shelter-1'],
  u2: ['shelter-2'],
  u3: [],
};

const ShelterScope = TenantScopeHook.for<PetEntity>(PetEntity, {
  tenantKey: 'shelterId',
  resolve: (actor: Actor) => SHELTER_MEMBERSHIP[actor.id] ?? [],
});

const petResource = defineResource<PetEntity>({
  key: 'pet',
  entity: PetEntity,
  path: 'pets',
  tags: ['Pets'],
  hooks: [ShelterScope],
  operations: {
    list: { output: petResponseSchema },
    read: { output: petResponseSchema },
    create: { input: petCreateSchema, output: petResponseSchema },
  },
});

describe('TenantScopeHook — cross-shelter isolation (e2e, issue #69)', () => {
  let app: INestApplication;
  let petAId: string;
  let petBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [PetEntity],
          synchronize: true,
          dropSchema: true,
        }),
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(MultiUserAuthAdapter),
          providers: [MultiUserAuthAdapter],
          repository: TypeOrmRepositoryModule,
          resources: [petResource],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const petA = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', 'Bearer u1')
      .send({ name: 'Rex', shelterId: 'shelter-1' })
      .expect(201);
    petAId = petA.body.id;

    const petB = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', 'Bearer u2')
      .send({ name: 'Fido', shelterId: 'shelter-2' })
      .expect(201);
    petBId = petB.body.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('u1 sees only shelter-1 pets on list', async () => {
    const res = await request(app.getHttpServer())
      .get('/pets')
      .set('Authorization', 'Bearer u1')
      .expect(200);

    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(petAId);
    expect(ids).not.toContain(petBId);
  });

  it('u2 sees only shelter-2 pets on list', async () => {
    const res = await request(app.getHttpServer())
      .get('/pets')
      .set('Authorization', 'Bearer u2')
      .expect(200);

    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(petBId);
    expect(ids).not.toContain(petAId);
  });

  it('u3 (member of no shelter) sees an empty list — fail-closed, not a full dump', async () => {
    const res = await request(app.getHttpServer())
      .get('/pets')
      .set('Authorization', 'Bearer u3')
      .expect(200);

    expect(res.body.data).toEqual([]);
  });

  it("u1 reading shelter-2's pet directly gets 404, not the row", async () => {
    await request(app.getHttpServer())
      .get(`/pets/${petBId}`)
      .set('Authorization', 'Bearer u1')
      .expect(404);
  });

  it("u1 reading their own shelter's pet succeeds", async () => {
    const res = await request(app.getHttpServer())
      .get(`/pets/${petAId}`)
      .set('Authorization', 'Bearer u1')
      .expect(200);

    expect(res.body.id).toBe(petAId);
  });
});
