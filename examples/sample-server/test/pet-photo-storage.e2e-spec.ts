import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from '@concepta/rockets';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { photosRoot } from '../src/resources/pet-photo/pet-photo.feature';

/**
 * `@concepta/rockets-storage` used through the app, not through its own
 * unit tests: real bytes, the filesystem driver, a metadata table, and the
 * ownership rules that make object keys safe.
 *
 * Every assertion here is about behaviour a consumer depends on — the
 * bytes come back identical, the key is scoped to the pet, deleting the
 * row deletes the object, and a store that cannot expire a URL says so
 * instead of pretending.
 */
const PNG_BYTES = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d4944415478da63fcffff3f0300050101002d0dd8a8' +
    '0000000049454e44ae426082',
  'hex',
);

describe('Pet photos — rockets-storage (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;
  let petId: string;
  let otherToken: string;
  let photoId: string;
  let storageKey: string;

  async function signup(email: string): Promise<{ id: string; token: string }> {
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email, password: 'password123', name: email })
      .expect(201);
    return { id: res.body.id, token: res.body.accessToken };
  }

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));
    await app.init();

    const owner = await signup('photo-owner@example.com');
    userId = owner.id;
    accessToken = owner.token;
    otherToken = (await signup('photo-stranger@example.com')).token;

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Rex', species: 'Dog', age: 3, status: 'active', userId })
      .expect(201);
    petId = pet.body.id;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('uploads bytes and records the metadata row', async () => {
    const res = await request(app.getHttpServer())
      .post(`/pets/${petId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        filename: 'rex.png',
        contentType: 'image/png',
        data: PNG_BYTES.toString('base64'),
      })
      .expect(201);

    expect(res.body.petId).toBe(petId);
    expect(res.body.contentType).toBe('image/png');
    expect(res.body.size).toBe(PNG_BYTES.byteLength);
    expect(res.body.uploadedBy).toBe(userId);
    // Tenancy lives in the key the APP chose — the driver never invents one.
    expect(res.body.storageKey).toMatch(
      new RegExp(`^pets/${petId}/[0-9a-f-]{36}\\.png$`),
    );
    photoId = res.body.id;
    storageKey = res.body.storageKey;
  });

  it('really wrote the bytes to the store, byte for byte', async () => {
    const onDisk = await readFile(join(photosRoot, storageKey));
    expect(onDisk.equals(PNG_BYTES)).toBe(true);
  });

  it('serves the same bytes back through the API', async () => {
    const res = await request(app.getHttpServer())
      .get(`/pets/${petId}/photos/${photoId}/raw`)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(res.headers['content-type']).toContain('image/png');
    expect((res.body as Buffer).equals(PNG_BYTES)).toBe(true);
  });

  it('lists only this pet photos', async () => {
    const res = await request(app.getHttpServer())
      .get(`/pets/${petId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(photoId);
  });

  // The filesystem driver does not advertise `signedDownloadPolicy`, so
  // asking for an expiry is refused rather than answered with a URL that
  // never expires. The route reports `expiresIn: null` instead of lying.
  it('does not claim an expiry the store cannot honor', async () => {
    const res = await request(app.getHttpServer())
      .get(`/pets/${petId}/photos/${photoId}/url?expiresIn=300`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.expiresIn).toBeNull();
    expect(typeof res.body.url).toBe('string');
  });

  it('refuses a stranger on every photo route', async () => {
    await request(app.getHttpServer())
      .get(`/pets/${petId}/photos`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/pets/${petId}/photos/${photoId}/raw`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/pets/${petId}/photos`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        filename: 'x.png',
        contentType: 'image/png',
        data: PNG_BYTES.toString('base64'),
      })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/pets/${petId}/photos/${photoId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
  });

  it('rejects an unsupported media type before touching the store', async () => {
    const before = await readdir(join(photosRoot, 'pets', petId));
    await request(app.getHttpServer())
      .post(`/pets/${petId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        filename: 'evil.svg',
        contentType: 'image/svg+xml',
        data: PNG_BYTES.toString('base64'),
      })
      .expect(400);
    expect(await readdir(join(photosRoot, 'pets', petId))).toEqual(before);
  });

  it('deletes the row and the stored object together', async () => {
    await request(app.getHttpServer())
      .delete(`/pets/${petId}/photos/${photoId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/pets/${petId}/photos`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(0));

    await expect(readFile(join(photosRoot, storageKey))).rejects.toThrow();
  });
});
