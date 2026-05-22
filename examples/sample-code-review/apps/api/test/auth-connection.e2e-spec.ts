/**
 * Firebase Bearer → Rockets AuthServerGuard → GET /me
 *
 * Uses FIREBASE_USE_FAKE (same as sample-code-review.e2e-spec.ts) so CI
 * does not need a service account. Proves the connection contract:
 * login token in Authorization header is validated and /me returns the user.
 */
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

const VALID_FIREBASE_BEARER = 'Bearer fb-user-token';

describe('auth connection — Bearer token → GET /me (e2e)', () => {
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

  it('GET /me without Authorization returns 401', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });

  it('GET /me with empty Bearer returns 401', async () => {
    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer ')
      .expect(401);
  });

  it('GET /me with invalid Firebase JWT returns 401', async () => {
    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer not-a-real-firebase-jwt')
      .expect(401);

    const message = String(response.body.message ?? '');
    expect(message.toLowerCase()).toMatch(/invalid|expired|token/);
  });

  it('GET /me with valid Firebase Bearer returns 200 and user identity', async () => {
    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', VALID_FIREBASE_BEARER)
      .expect(200);

    expect(response.body).toMatchObject({
      id: 'firebase-user',
      email: 'user@firebase.demo',
    });
    expect(response.body.userMetadata).toBeDefined();
  });

  it('GET /github/oauth/url with valid Bearer returns authorize URL', async () => {
    const response = await request(app.getHttpServer())
      .get('/github/oauth/url')
      .set('Authorization', VALID_FIREBASE_BEARER)
      .expect(200);

    expect(typeof response.body.authorizeUrl).toBe('string');
    expect(response.body.authorizeUrl.length).toBeGreaterThan(0);
    expect(typeof response.body.state).toBe('string');
  });
});
