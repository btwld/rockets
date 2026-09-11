import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from '@concepta/rockets';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import {
  archiveRoot,
  documentsRoot,
} from '../src/resources/pet-document/pet-document.feature';

/**
 * The half of the storage contract a single small upload never reaches:
 * two named stores, streamed reads, byte ranges, bulk delete, and moving
 * objects between stores.
 */
const DOC_TEXT = Array.from(
  { length: 64 },
  (_, i) => `line ${String(i).padStart(3, '0')}`,
).join('\n');
const DOC_BYTES = Buffer.from(DOC_TEXT, 'utf8');

/**
 * supertest parses a text body by default, which would corrupt binary
 * content. The callback stays INLINE: `.parse()` is overloaded, and TypeScript
 * only picks the `(res, cb)` overload when the function literal sits at the
 * call site — hoisting it into a named const resolves to the `(str)` one.
 */
function binary(test: request.Test): request.Test {
  return test.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => chunks.push(chunk));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
}

describe('Pet documents — storage streaming, ranges, two stores (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let userId: string;
  let petId: string;
  const documentIds: string[] = [];
  const storageKeys: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));
    await app.init();

    const signup = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'doc-owner@example.com',
        password: 'password123',
        name: 'Doc Owner',
      })
      .expect(201);
    userId = signup.body.id;
    token = signup.body.accessToken;

    const pet = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Milo', species: 'Cat', age: 2, status: 'active', userId })
      .expect(201);
    petId = pet.body.id;
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('uploads two documents through a streamed body', async () => {
    for (const title of ['Vaccination record', 'X-ray report']) {
      const res = await request(app.getHttpServer())
        .post(`/pets/${petId}/documents`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          title,
          contentType: 'text/plain',
          data: DOC_BYTES.toString('base64'),
        })
        .expect(201);

      expect(res.body.store).toBe('pet-documents');
      expect(res.body.size).toBe(DOC_BYTES.byteLength);
      documentIds.push(res.body.id);
      storageKeys.push(res.body.storageKey);
    }

    // Both landed in the live store, neither in the archive. The fs driver
    // keeps content type and metadata in a `<key>.meta.json` sidecar next
    // to the object, so the directory holds two files per key — the
    // sidecars never surface as logical keys through the storage API.
    const live = await readdir(join(documentsRoot, 'pets', petId));
    expect(live.filter((name) => !name.endsWith('.meta.json'))).toHaveLength(2);
    expect(live.filter((name) => name.endsWith('.meta.json'))).toHaveLength(2);
    await expect(readdir(join(archiveRoot, 'pets', petId))).rejects.toThrow();
  });

  it('streams the whole document back unchanged', async () => {
    const res = await binary(
      request(app.getHttpServer())
        .get(`/pets/${petId}/documents/${documentIds[0]}/content`)
        .set('Authorization', `Bearer ${token}`),
    ).expect(200);

    expect((res.body as Buffer).equals(DOC_BYTES)).toBe(true);
  });

  it('serves an exact byte range', async () => {
    const res = await binary(
      request(app.getHttpServer())
        .get(`/pets/${petId}/documents/${documentIds[0]}/content`)
        .set('Authorization', `Bearer ${token}`)
        .set('Range', 'bytes=9-17'),
    ).expect(200);

    // The range is inclusive on both ends, like HTTP.
    expect((res.body as Buffer).toString('utf8')).toBe(DOC_TEXT.slice(9, 18));
  });

  it('serves an open-ended range to the end of the object', async () => {
    const start = DOC_BYTES.byteLength - 12;
    const res = await binary(
      request(app.getHttpServer())
        .get(`/pets/${petId}/documents/${documentIds[0]}/content`)
        .set('Authorization', `Bearer ${token}`)
        .set('Range', `bytes=${start}-`),
    ).expect(200);

    expect((res.body as Buffer).toString('utf8')).toBe(DOC_TEXT.slice(start));
  });

  it('moves every live document to the archive store and repoints the rows', async () => {
    const res = await request(app.getHttpServer())
      .post(`/pets/${petId}/documents/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.archived).toHaveLength(2);

    // Bytes are in the archive now, and gone from the live store.
    for (const key of storageKeys) {
      const archived = await readFile(join(archiveRoot, key));
      expect(archived.equals(DOC_BYTES)).toBe(true);
      await expect(readFile(join(documentsRoot, key))).rejects.toThrow();
    }

    const listed = await request(app.getHttpServer())
      .get(`/pets/${petId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      listed.body.every((d: { store: string }) => d.store === 'pet-archive'),
    ).toBe(true);
  });

  it('still streams a document after it moved stores', async () => {
    const res = await binary(
      request(app.getHttpServer())
        .get(`/pets/${petId}/documents/${documentIds[1]}/content`)
        .set('Authorization', `Bearer ${token}`),
    ).expect(200);

    expect((res.body as Buffer).equals(DOC_BYTES)).toBe(true);
  });

  it('archiving again is a no-op rather than a re-upload', async () => {
    const res = await request(app.getHttpServer())
      .post(`/pets/${petId}/documents/archive`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.archived).toHaveLength(0);
    expect(res.body.skipped).toHaveLength(0);
  });

  it('bulk-deletes the rows and the objects in whichever store holds them', async () => {
    await request(app.getHttpServer())
      .delete(`/pets/${petId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/pets/${petId}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(0));

    for (const key of storageKeys) {
      await expect(readFile(join(archiveRoot, key))).rejects.toThrow();
    }
  });
});
