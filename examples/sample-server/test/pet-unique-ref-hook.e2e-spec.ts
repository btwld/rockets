import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { HttpAdapterHost } from '@nestjs/core';
import { ExceptionsFilter } from '@bitwild/rockets';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Focused repro for the custom Pet create handler: duplicate `uniqueRef` on
 * create must return clear `409 Conflict`.
 */
describe('Pet uniqueRef create handler (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

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

  it('signup', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({
        email: 'pet-unique-ref-handler@example.com',
        password: 'password123',
        name: 'Handler Tester',
      })
      .expect(201);
    accessToken = res.body.accessToken as string;
    expect(accessToken).toBeTruthy();
  });

  it('POST /pets — first create with uniqueRef succeeds', async () => {
    const res = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Alpha',
        species: 'Dog',
        age: 1,
        status: 'active',
        uniqueRef: 'E2E-UNIQUE-REF-001',
      })
      .expect(201);

    expect(res.body.uniqueRef).toBe('E2E-UNIQUE-REF-001');
  });

  it('POST /pets — duplicate uniqueRef returns 409 with descriptive message', async () => {
    const res = await request(app.getHttpServer())
      .post('/pets')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Beta',
        species: 'Cat',
        age: 2,
        status: 'active',
        uniqueRef: 'E2E-UNIQUE-REF-001',
      })
      .expect(409);

    expect(res.body.message).toContain('E2E-UNIQUE-REF-001');
  });
});
