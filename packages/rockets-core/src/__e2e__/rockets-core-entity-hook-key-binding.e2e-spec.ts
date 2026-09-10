/**
 * E2E proof for the entity-hook KEY binding invariant (issue #69 review).
 *
 * `@EntityHook({ entity })` bakes `deriveEntityKey(entity)` into its spec,
 * while the repository adapter stamps the REGISTRATION key — the resource's
 * `key`, which defaults to the derived key but need not equal it — onto the
 * hook context. Matching is an exact string compare.
 *
 * So `defineResource({ entity: PetEntity, key: 'pets' })` (a plausible
 * author choice next to `path: 'pets'`) registers the entity as `'pets'`
 * while a `TenantScopeHook.for(PetEntity, …)` on that same resource matches
 * `'pet'`. Before this check the app booted clean, nothing warned, and the
 * scoping hook silently never fired — a total fail-OPEN for a hook whose
 * entire job is denying access to other tenants' rows.
 *
 * Two halves, and BOTH matter:
 *  1. The mismatch fails the boot, naming the key actually in use.
 *  2. The documented escape hatch (`entityKey`) really does make the hook
 *     fire under a custom key — proved against a real DB, not asserted.
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

/** Derived key `pet`, deliberately registered under `pets`. */
@Entity('hook_binding_pets')
class PetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) shelterId!: string;
}

/** Derived key `animal`, registered under `animals` WITH the escape hatch. */
@Entity('hook_binding_animals')
class AnimalEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) name!: string;
  @Column({ type: 'varchar' }) shelterId!: string;
}

const createSchema = withOpenApi(
  z.object({ name: z.string(), shelterId: z.string() }),
  'HookBindingCreateDto',
);
const responseSchema = withOpenApi(
  z.object({ id: z.uuid(), name: z.string(), shelterId: z.string() }),
  'HookBindingResponseDto',
);

@Injectable()
class MultiUserAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };
    if (token === 'u1' || token === 'u2') {
      return { matched: true, user: { id: token, sub: token } };
    }
    return { matched: true, error: new UnauthorizedException() };
  }
}

const SHELTER_MEMBERSHIP: Readonly<Record<string, readonly string[]>> = {
  u1: ['shelter-1'],
  u2: ['shelter-2'],
};

const resolve = (actor: Actor): readonly string[] =>
  SHELTER_MEMBERSHIP[actor.id] ?? [];

describe('entity-hook key binding (issue #69 review, M1)', () => {
  describe('a hook whose key does not match the registered key fails the boot', () => {
    // `RocketsCoreModule.forRoot` runs the planner eagerly, so the throw
    // lands while the `imports` array is being built — before `.compile()`.
    // Wrapping the whole boot in an async fn asserts "the boot fails"
    // without depending on which of the two it comes out of.
    const boot = async (): Promise<unknown> => {
      const mismatched = defineResource<PetEntity>({
        // `pets` is registered; the hook below matches `pet`.
        key: 'pets',
        entity: PetEntity,
        path: 'pets',
        tags: ['Pets'],
        hooks: [
          TenantScopeHook.for<PetEntity>(PetEntity, {
            tenantKey: 'shelterId',
            resolve,
          }),
        ],
        operations: {
          list: { output: responseSchema },
          create: { input: createSchema, output: responseSchema },
        },
      });

      return Test.createTestingModule({
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
            resources: [mismatched],
            global: true,
          }),
        ],
      }).compile();
    };

    it('names the hook, both keys, and both remedies instead of booting fail-open', async () => {
      await expect(boot()).rejects.toThrow(
        /hook `TenantScopeHook_PetEntity_shelterId` matches entity key "pet", but `PetEntity` is registered under "pets"/,
      );
    });

    it('offers the `entityKey` escape hatch in the message, not just a dead end', async () => {
      await expect(boot()).rejects.toThrow(
        /entityKey: 'pets'|set `key: 'pet'`/,
      );
    });
  });

  describe('the `entityKey` escape hatch makes the hook fire under a custom key', () => {
    let app: INestApplication;
    let mineId: string;
    let theirsId: string;

    beforeAll(async () => {
      const animals = defineResource<AnimalEntity>({
        key: 'animals',
        entity: AnimalEntity,
        path: 'animals',
        tags: ['Animals'],
        hooks: [
          TenantScopeHook.for<AnimalEntity>(AnimalEntity, {
            tenantKey: 'shelterId',
            resolve,
            // Without this the derived key would be `animal` and the hook
            // would never fire — which is now a boot failure, not a leak.
            entityKey: 'animals',
          }),
        ],
        operations: {
          list: { output: responseSchema },
          read: { output: responseSchema },
          create: { input: createSchema, output: responseSchema },
        },
      });

      const moduleRef = await Test.createTestingModule({
        imports: [
          TypeOrmModule.forRoot({
            type: 'sqlite',
            database: ':memory:',
            entities: [AnimalEntity],
            synchronize: true,
            dropSchema: true,
          }),
          RocketsCoreModule.forRoot({
            auth: defineAuthAdapter(MultiUserAuthAdapter),
            providers: [MultiUserAuthAdapter],
            repository: TypeOrmRepositoryModule,
            resources: [animals],
            global: true,
          }),
        ],
        providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      const mine = await request(app.getHttpServer())
        .post('/animals')
        .set('Authorization', 'Bearer u1')
        .send({ name: 'Rex', shelterId: 'shelter-1' })
        .expect(201);
      mineId = mine.body.id;

      const theirs = await request(app.getHttpServer())
        .post('/animals')
        .set('Authorization', 'Bearer u2')
        .send({ name: 'Fido', shelterId: 'shelter-2' })
        .expect(201);
      theirsId = theirs.body.id;
    });

    afterAll(async () => {
      if (app) await app.close();
    });

    it("scopes the list to the caller's own shelter", async () => {
      const res = await request(app.getHttpServer())
        .get('/animals')
        .set('Authorization', 'Bearer u1')
        .expect(200);

      const ids = res.body.data.map((row: { id: string }) => row.id);
      expect(ids).toContain(mineId);
      expect(ids).not.toContain(theirsId);
    });

    it("404s a direct read of the other shelter's row", async () => {
      await request(app.getHttpServer())
        .get(`/animals/${theirsId}`)
        .set('Authorization', 'Bearer u1')
        .expect(404);
    });
  });
});
