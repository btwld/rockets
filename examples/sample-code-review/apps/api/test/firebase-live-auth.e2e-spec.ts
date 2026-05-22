/**
 * Live Firebase → GET /me (optional).
 *
 *   FIREBASE_LIVE_TEST=true \
 *   FIREBASE_TEST_EMAIL=you@example.com \
 *   FIREBASE_TEST_PASSWORD='...' \
 *   FIREBASE_WEB_API_KEY=AIza... \
 *   yarn test:e2e --testPathPattern=firebase-live-auth
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import request from 'supertest';

import { ExceptionsFilter } from '@bitwild/rockets';

import { AppModule } from '../src/app.module';

const runLive = process.env.FIREBASE_LIVE_TEST === 'true';
const email = process.env.FIREBASE_TEST_EMAIL?.trim();
const password = process.env.FIREBASE_TEST_PASSWORD;
const webApiKey = process.env.FIREBASE_WEB_API_KEY?.trim();

const describeLive = runLive && email && password && webApiKey ? describe : describe.skip;

describeLive('firebase live auth — real token → GET /me (e2e)', () => {
  let app: INestApplication;
  let idToken: string;

  beforeAll(async () => {
    delete process.env.FIREBASE_USE_FAKE;
    process.env.FIREBASE_PROJECT_ID =
      process.env.FIREBASE_PROJECT_ID ?? 'rockets-review-demo';
    process.env.GITHUB_USE_FAKE = 'true';
    process.env.GITHUB_CLIENT_ID = 'e2e-client-id';
    process.env.GITHUB_CLIENT_SECRET = 'e2e-client-secret';
    process.env.GITHUB_OAUTH_CALLBACK_URL =
      'http://localhost:3000/auth/github/callback';

    const signInRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${webApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      },
    );

    const signInBody = (await signInRes.json()) as {
      idToken?: string;
      error?: { message?: string };
    };

    if (!signInRes.ok || !signInBody.idToken) {
      throw new Error(
        `Firebase sign-in failed: ${signInBody.error?.message ?? signInRes.status}`,
      );
    }

    idToken = signInBody.idToken;

    app = await NestFactory.create(AppModule, { logger: ['error'] });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    const httpAdapterHost = app.get(HttpAdapterHost);
    app.useGlobalFilters(new ExceptionsFilter(httpAdapterHost));
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /me returns 200 with Firebase user email', async () => {
    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${idToken}`)
      .expect(200);

    expect(typeof response.body.id).toBe('string');
    expect(response.body.id.length).toBeGreaterThan(0);
    expect(response.body.email).toBe(email);
  });
});
