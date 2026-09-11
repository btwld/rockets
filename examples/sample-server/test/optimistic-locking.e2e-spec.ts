import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from '@concepta/rockets';
import request from 'supertest';

import { AppModule } from '../src/app.module';

/**
 * `petSchema` is built from `auditableEntity`, which carries `f.version()`.
 * Since `@concepta/nestjs-repository` 8.0.0-alpha.11 a version column turns
 * update/replace into a compare-and-swap, so the second of two writers who
 * both read the same row is rejected instead of silently overwriting the
 * first — TypeORM's own `@VersionColumn` increments, but the WHERE clause
 * it builds is keyed only by primary key.
 *
 * This only works because the entity actually HAS a version column. Until
 * `f.version()` declared `db: { version: true }` it compiled to a plain
 * integer, and every one of these writes won.
 */
describe('Optimistic locking on generated entities (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  let petId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));
    await app.init();

    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'locking@example.com',
        password: 'password123',
        name: 'Locking',
      })
      .expect(201);
    userId = signup.body.id;
    token = signup.body.accessToken;

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bolt', species: 'Dog', age: 1, status: 'active', userId })
      .expect(201);
    petId = pet.body.id;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('exposes a version on the generated entity', async () => {
    const res = await request(app.getHttpServer())
      .get(`/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.version).toBe(1);
  });

  it('increments the version on every write', async () => {
    await request(app.getHttpServer())
      .patch(`/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ age: 2 })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.version).toBe(2);
    expect(res.body.age).toBe(2);
  });

  // What this pins: two writers who read the same row never BOTH commit.
  // Removing `db: { version: true }` from `f.version()` makes both answer
  // 200 and one change vanish — that is the regression this guards.
  //
  // What it does not pin: the losing status. A real database returns
  // `OptimisticLockException` (409, `OPTIMISTIC_LOCK_CONFLICT`); this
  // sample runs in-memory SQLite on a single connection, where the two
  // requests collide at the transaction layer first and the loser gets a
  // 5xx. Asserting 409 here would be asserting the database, not the lock.
  it('lets the last of two concurrent writers lose instead of clobbering', async () => {
    const [a, b] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/pets/${petId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Writer A' }),
      request(app.getHttpServer())
        .patch(`/pets/${petId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Writer B' }),
    ]);

    const statuses = [a.status, b.status].sort();
    // One commits; the other is refused rather than overwriting it. Without
    // the version column both answered 200 and one change vanished.
    expect(statuses[0]).toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);

    const winner = a.status === 200 ? 'Writer A' : 'Writer B';
    const final = await request(app.getHttpServer())
      .get(`/pets/${petId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(final.body.name).toBe(winner);
  });
});
