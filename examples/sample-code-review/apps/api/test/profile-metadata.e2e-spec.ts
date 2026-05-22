process.env.FIREBASE_USE_FAKE = 'true';
process.env.GITHUB_USE_FAKE = 'true';
process.env.GITHUB_CLIENT_ID = 'e2e-client-id';
process.env.GITHUB_CLIENT_SECRET = 'e2e-client-secret';
process.env.GITHUB_OAUTH_CALLBACK_URL = 'http://localhost:3000/auth/github/callback';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import request from 'supertest';

import { ExceptionsFilter } from '@bitwild/rockets';

import { AppModule } from '../src/app.module';

const AUTH = 'Bearer fb-user-token';

describe('profile userMetadata — PATCH /me (e2e)', () => {
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

  it('creates and updates firstName and lastName via GET/PATCH /me', async () => {
    const initial = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', AUTH)
      .expect(200);

    expect(initial.body.id).toBe('firebase-user');

    const updated = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', AUTH)
      .send({
        userMetadata: {
          firstName: 'Ada',
          lastName: 'Lovelace',
        },
      })
      .expect(200);

    expect(updated.body.userMetadata).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    const again = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', AUTH)
      .expect(200);

    expect(again.body.userMetadata).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });
});
