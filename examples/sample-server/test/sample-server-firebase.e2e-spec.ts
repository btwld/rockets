/**
 * E2E proof that the sample server boots cleanly with the Firebase
 * adapter substituted for the in-process JWT one. Mirrors the same
 * `Bearer <token>` contract from the JWT spec — the `Authorization`
 * header carries a token, the global guard validates it via the auth
 * adapter, and `GET /me` returns the resolved `AuthorizedUser`.
 *
 * Tokens come from `SampleFakeFirebaseVerifier` (no real firebase-admin
 * setup in the sample). The verifier:
 *  - accepts `fb-admin-token` → uid `firebase-admin`, role `admin`
 *  - accepts `fb-user-token`  → uid `firebase-user`, role `user`
 *  - rejects `fb-revoked-token` with `auth/id-token-revoked`
 *  - rejects everything else with `auth/argument-error`
 *
 * The point of this file is to lock in the cross-adapter contract:
 * if `RocketsModule` ever stops routing through `authAdapter` from a
 * `RocketsAuthIntegration` bundle, or core's `AuthAdapterInterface`
 * drifts, this spec fails first.
 *
 * The auth toggle lives in `app.module.ts`:
 *   `AUTH_PROVIDER=firebase` → `defineFirebaseSampleAuth()`
 *   (default `jwt`)         → `defineSampleAuth()`
 *
 * We set the env var BEFORE importing `AppModule` so the
 * module-level `auth = ...` constant resolves to the Firebase bundle.
 */
process.env.AUTH_PROVIDER = 'firebase';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import request from 'supertest';

import { ExceptionsFilter } from '@bitwild/rockets';

// Imported AFTER the env-var write above so the toggle is captured.
// eslint-disable-next-line import/order
import { AppModule } from '../src/app.module';

describe('Sample Server — AUTH_PROVIDER=firebase (e2e)', () => {
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

  describe('global guard via FirebaseAuthAdapter', () => {
    it('GET /me — returns the resolved user for a known fake token', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer fb-user-token')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'firebase-user',
        sub: 'firebase-user',
        email: 'user@firebase.demo',
      });
      // DefaultFirebaseUserResolverService maps `roles: ['user']`
      // custom claim → `userRoles: [{ role: { name: 'user' } }]`.
      expect(res.body.userRoles).toEqual([{ role: { name: 'user' } }]);
    });

    it('GET /me — admin token resolves with the admin role claim', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer fb-admin-token')
        .expect(200);

      expect(res.body.userRoles).toEqual([{ role: { name: 'admin' } }]);
    });

    it('GET /me — returns 401 for a token the verifier rejects', async () => {
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('GET /me — returns 401 for a revoked token (auth/id-token-revoked path)', async () => {
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer fb-revoked-token')
        .expect(401);
    });

    it('GET /me — returns 401 when no Authorization header is sent', async () => {
      await request(app.getHttpServer()).get('/me').expect(401);
    });
  });

  describe('JWT-mode routes are NOT registered in firebase mode', () => {
    // Firebase mode swaps out `defineSampleAuth()` (which mounts
    // `AuthController`) for `defineFirebaseSampleAuth()` (which does
    // NOT). The `/auth/*` endpoints should not exist; signup/login
    // happens client-side via the Firebase SDK.
    it('POST /auth/signup — returns 404 (route not registered)', async () => {
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send({ email: 'x@y.z', password: 'whatever' })
        .expect(404);
    });

    it('POST /auth/login — returns 404 (route not registered)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'x@y.z', password: 'whatever' })
        .expect(404);
    });
  });
});
