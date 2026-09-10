import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ExceptionsFilter } from '@concepta/rockets';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Focused consumer coverage for issue #43 — pet-transfer migrated from a
 * hand-written Nest controller to `operationResource` over the existing CQRS
 * handler. The full transfer matrix still lives in sample-server.e2e-spec.ts.
 */
describe('operationResource pet-transfer sample (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let otherId: string;
  let petId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
    await app.init();

    const owner = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'ops-transfer-owner@example.com',
        password: 'password123',
        name: 'OpsTransferOwner',
      })
      .expect(201);
    ownerToken = owner.body.accessToken as string;

    const other = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'ops-transfer-recipient@example.com',
        password: 'password123',
        name: 'OpsTransferRecipient',
      })
      .expect(201);
    otherId = other.body.id as string;

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'OpsTransferPet', species: 'Dog', age: 2 })
      .expect(201);
    petId = pet.body.id as string;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('POST /pets/:petId/transfer — 401 without bearer token', async () => {
    await request(app.getHttpServer())
      .post(`/pets/${petId}/transfer`)
      .send({ newOwnerId: otherId })
      .expect(401);
  });

  it('POST /pets/:petId/transfer — 400 on invalid body', async () => {
    await request(app.getHttpServer())
      .post(`/pets/${petId}/transfer`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newOwnerId: 'not-a-uuid' })
      .expect(400);
  });

  it('POST /pets/:petId/transfer — owner transfers and response is whitelisted', async () => {
    const res = await request(app.getHttpServer())
      .post(`/pets/${petId}/transfer`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newOwnerId: otherId })
      .expect(200);

    expect(res.body).toEqual({ id: petId, userId: otherId });
    expect(res.body).not.toHaveProperty('name');
  });

  it('rejects self-transfer with 400', async () => {
    // Pet now owned by otherId after the previous test — use other as actor.
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'ops-transfer-recipient@example.com',
        password: 'password123',
      })
      .expect(200);
    const otherToken = login.body.accessToken as string;

    await request(app.getHttpServer())
      .post(`/pets/${petId}/transfer`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ newOwnerId: otherId })
      .expect(400);
  });
});
