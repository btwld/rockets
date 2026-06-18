import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ExceptionsFilter } from '@bitwild/rockets';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Runtime contract of the zod-driven tag resource (`tagZodResource`,
 * registered in AppModule): the nestjs-zod DTOs carry the source zod
 * schema as a Standard Schema, so the rockets-crud pipe must enforce
 * every constraint (including `.refine()`) and strip unknown keys —
 * with the same bootstrap as main.ts (global ValidationPipe included,
 * which must NOT interfere with schema-validated bodies).
 */
describe('zod-compiled tag resource CRUD (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let tagId: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('signup', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'zod-tag-crud@example.com',
        password: 'password123',
        name: 'Zod Tag Tester',
      })
      .expect(201);
    accessToken = res.body.accessToken as string;
    expect(accessToken).toBeTruthy();
  });

  it('GET /tags — 401 without bearer token', async () => {
    await request(app.getHttpServer()).get('/tags').expect(401);
  });

  it('POST /tags — creates from compiled create DTO', async () => {
    const res = await request(app.getHttpServer())
      .post('/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'zod-vaccinated', color: '#00ff00' })
      .expect(201);

    expect(res.body.name).toBe('zod-vaccinated');
    expect(res.body.color).toBe('#00ff00');
    expect(res.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    tagId = res.body.id as string;
  });

  it('POST /tags — unknown keys are whitelisted away, not persisted as error', async () => {
    const res = await request(app.getHttpServer())
      .post('/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'zod-extra', sneaky: 'field' })
      .expect(201);
    expect(res.body).not.toHaveProperty('sneaky');
  });

  it('POST /tags — 400 on empty name (z.string().min(1))', async () => {
    await request(app.getHttpServer())
      .post('/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: '', color: '#123456' })
      .expect(400);
  });

  it('POST /tags — 400 on name longer than 100 (z.string().max(100))', async () => {
    await request(app.getHttpServer())
      .post('/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'x'.repeat(101) })
      .expect(400);
  });

  it('POST /tags — 400 on color longer than 20', async () => {
    await request(app.getHttpServer())
      .post('/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'zod-color-too-long', color: 'c'.repeat(21) })
      .expect(400);
  });

  it('POST /tags — 400 on zod-only .refine() rule (Standard Schema pipe)', async () => {
    // No class-validator decorator can express this rule — only the
    // CrudStandardSchemaValidationPipe (validating with the source zod
    // schema) can reject it.
    const res = await request(app.getHttpServer())
      .post('/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'zod-refine', color: 'ff0000' })
      .expect(400);
    expect(JSON.stringify(res.body.message)).toContain('color');
  });

  it('POST /tags — 400 on missing name (required in create DTO)', async () => {
    await request(app.getHttpServer())
      .post('/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ color: '#abcdef' })
      .expect(400);
  });

  it('GET /tags — lists the created tag (paginated body)', async () => {
    const res = await request(app.getHttpServer())
      .get('/tags')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const names = (res.body.data as { name: string }[]).map((t) => t.name);
    expect(names).toContain('zod-vaccinated');
  });

  it('GET /tags/:id — reads a single tag through the compiled response DTO', async () => {
    const res = await request(app.getHttpServer())
      .get(`/tags/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.name).toBe('zod-vaccinated');
    expect(res.body.dateCreated).toBeTruthy();
  });

  it('PATCH /tags/:id — updates without id in body (pk lenient at runtime)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/tags/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ color: '#0f0f0f' })
      .expect(200);
    expect(res.body.color).toBe('#0f0f0f');
  });

  it('PATCH /tags/:id — 400 on constraint violation in update DTO', async () => {
    await request(app.getHttpServer())
      .patch(`/tags/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'y'.repeat(101) })
      .expect(400);
  });

  it('DELETE /tags/:id — 404/405, delete was not enabled on the resource', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/tags/${tagId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect([404, 405]).toContain(res.status);
  });
});
