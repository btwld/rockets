/**
 * PR-0 style gate: one place that asserts the declarative resource stack
 * (operations object, soft delete + restore, sub-resource path scope,
 * owner isolation) still behaves end-to-end. Deeper scenarios live in
 * `sample-server.e2e-spec.ts`; this file is the short matrix smoke suite.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from '@bitwild/rockets';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Resource operations matrix (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('matrix: signup → create pet → list/read/update → soft-delete → 404 read → restore → 200 read', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: `matrix-alice-${Date.now()}@example.com`,
        password: 'password123',
        name: 'Matrix Alice',
      })
      .expect(201);
    const aliceToken = signup.body.accessToken as string;

    const created = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        name: 'Matrix Pet',
        species: 'Dog',
        age: 2,
        status: 'active',
      })
      .expect(201);
    const alicePetId = created.body.id as string;

    const list = await request(app.getHttpServer())
      .get('/pets')
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(
      (list.body.data as { id: string }[]).some((r) => r.id === alicePetId),
    ).toBe(true);

    const read = await request(app.getHttpServer())
      .get(`/pets/${alicePetId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(read.body.name).toBe('Matrix Pet');

    await request(app.getHttpServer())
      .patch(`/pets/${alicePetId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Matrix Pet Updated' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/pets/${alicePetId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/pets/${alicePetId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/pets/restore/${alicePetId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/pets/${alicePetId}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
  });

  it('matrix: sub-resource POST/GET/DELETE on /pets/:petId/tags with scope', async () => {
    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'matrix-tags@example.com',
        password: 'password123',
        name: 'Matrix Tags',
      })
      .expect(201);
    const token = signup.body.accessToken as string;

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Tagged',
        species: 'Cat',
        age: 1,
        status: 'active',
      })
      .expect(201);
    const petId = pet.body.id as string;

    const tag = await request(app.getHttpServer())
      .post('/tags')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `matrix-tag-${Date.now()}`, color: '#000000' })
      .expect(201);
    const tagUuid = tag.body.id as string;

    await request(app.getHttpServer())
      .post(`/pets/${petId}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .send({ tagId: tagUuid })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/pets/${petId}/tags`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(list.body.data)).toBe(true);
    expect((list.body.data as { tagId?: string }[]).length).toBeGreaterThan(
      0,
    );

    const row = (list.body.data as { id: string }[])[0];
    await request(app.getHttpServer())
      .delete(`/pets/${petId}/tags/${row.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('matrix: owner isolation — second user cannot read first user pet', async () => {
    const a = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: `matrix-a-${Date.now()}@example.com`,
        password: 'password123',
        name: 'A',
      })
      .expect(201);
    const aliceToken = a.body.accessToken as string;

    const b = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: `matrix-b-${Date.now()}@example.com`,
        password: 'password123',
        name: 'B',
      })
      .expect(201);
    const bobToken = b.body.accessToken as string;

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({
        name: 'Alice only',
        species: 'Dog',
        age: 4,
        status: 'active',
      })
      .expect(201);
    const pid = pet.body.id as string;

    await request(app.getHttpServer())
      .get(`/pets/${pid}`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(404);
  });
});
