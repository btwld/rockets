import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@bitwild/rockets-core';
import {
  createStubAuthBootstrap,
  extractBearerToken,
} from '@bitwild/rockets-core';
import type {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';
import { RocketsModule } from '../rockets.module';
import { StubUserMetadataEntity } from '../__fixtures__/entities/stub-user-metadata.entity';
import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';

// ────────────────────────────────────────────────────────────────────
// DTO Fixtures
// ────────────────────────────────────────────────────────────────────

class UserMetadataCreateDto implements UserMetadataCreatableInterface {
  @IsString() userId!: string;
  @IsOptional() @IsString() firstName?: string;
}

class UserMetadataUpdateDto implements UserMetadataModelUpdatableInterface {
  @IsString() id!: string;
  @IsOptional() @IsString() firstName?: string;
}

// ────────────────────────────────────────────────────────────────────
// Auth Provider Fixtures
// ────────────────────────────────────────────────────────────────────

/**
 * Simulates a Firebase auth provider.
 * Validates base64-encoded JSON tokens via `Authorization: Bearer`.
 */
@Injectable()
class FirebaseAuthAdapterFixture implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null || !token.startsWith('firebase:'))
      return { matched: false };

    const payload = token.substring('firebase:'.length);
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { uid: string; email?: string; roles?: string[] };

    return {
      matched: true,
      user: {
        id: decoded.uid,
        sub: decoded.uid,
        email: decoded.email,
        userRoles: decoded.roles?.map((name) => ({ role: { name } })),
        claims: { provider: 'firebase', ...decoded },
      },
    };
  }
}

/**
 * Simulates an API-key auth provider (custom).
 * Validates simple "apikey:<key>" tokens carried via `Authorization: Bearer`.
 */
@Injectable()
class ApiKeyAuthProviderFixture implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null || !token.startsWith('apikey:'))
      return { matched: false };

    if (token === 'apikey:service-account-123') {
      return {
        matched: true,
        user: {
          id: 'service-user',
          sub: 'service-user',
          email: 'service@api.internal',
          userRoles: [{ role: { name: 'service' } }],
          claims: { provider: 'apikey', scope: 'full' },
        },
      };
    }
    return {
      matched: true,
      error: new UnauthorizedException('Authentication failed'),
    };
  }
}

/**
 * Custom-transport adapter — credential lives in `X-API-Key: <key>`,
 * NOT in `Authorization: Bearer`. Proves the framework lets the
 * adapter own its wire format (no Bearer assumption baked into core).
 *
 * Used in the chain tests below alongside a Bearer-token adapter to
 * show that multiple adapters on different transports coexist.
 */
@Injectable()
class XApiKeyHeaderAuthAdapterFixture implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const raw = request.headers['x-api-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key) return { matched: false };

    if (key === 'xapi-secret-1') {
      return {
        matched: true,
        user: {
          id: 'xapi-user',
          sub: 'xapi-user',
          email: 'mcp@service.local',
          userRoles: [{ role: { name: 'service' } }],
          claims: { provider: 'x-api-key' },
        },
      };
    }
    return {
      matched: true,
      error: new UnauthorizedException('Invalid X-API-Key'),
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function createFirebaseToken(payload: {
  uid: string;
  email?: string;
  roles?: string[];
}): string {
  return (
    'firebase:' + Buffer.from(JSON.stringify(payload)).toString('base64url')
  );
}

function buildApp(adapter: Type<AuthAdapterInterface>) {
  return Test.createTestingModule({
    imports: [
      RocketsModule.forRoot({
        auth: createStubAuthBootstrap(adapter),
        userMetadata: {
          entity: StubUserMetadataEntity,
          createDto: UserMetadataCreateDto,
          updateDto: UserMetadataUpdateDto,
        },
        repository: E2eFakeRepositoryModule,
      }),
    ],
  }).compile();
}

function buildChainApp(adapters: ReadonlyArray<Type<AuthAdapterInterface>>) {
  return Test.createTestingModule({
    imports: [
      RocketsModule.forRoot({
        auth: adapters.map((entry) => createStubAuthBootstrap(entry)),
        userMetadata: {
          entity: StubUserMetadataEntity,
          createDto: UserMetadataCreateDto,
          updateDto: UserMetadataUpdateDto,
        },
        repository: E2eFakeRepositoryModule,
      }),
    ],
  }).compile();
}

// ────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────

describe('RocketsModule — Multi Auth Provider (e2e)', () => {
  describe('Firebase Auth Provider', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await buildApp(FirebaseAuthAdapterFixture);
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /me with valid Firebase token returns user', async () => {
      const token = createFirebaseToken({
        uid: 'fb-user-42',
        email: 'alice@firebase.test',
        roles: ['editor'],
      });

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'fb-user-42',
        sub: 'fb-user-42',
        email: 'alice@firebase.test',
        userRoles: [{ role: { name: 'editor' } }],
        claims: { provider: 'firebase', uid: 'fb-user-42' },
      });
    });

    it('GET /me with invalid Firebase token returns 401', async () => {
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer jwt-token-wont-work')
        .expect(401);
    });

    it('PATCH /me creates metadata for Firebase user', async () => {
      const token = createFirebaseToken({
        uid: 'fb-user-99',
        email: 'bob@firebase.test',
      });

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${token}`)
        .send({ userMetadata: { firstName: 'Bob' } })
        .expect(200);

      expect(res.body.id).toBe('fb-user-99');
      expect(res.body.userMetadata).toHaveProperty('userId', 'fb-user-99');
    });

    it('PATCH /me with no userMetadata body still succeeds (empty update)', async () => {
      const token = createFirebaseToken({
        uid: 'fb-user-100',
        email: 'empty@firebase.test',
      });

      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(200);

      expect(res.body.id).toBe('fb-user-100');
    });
  });

  describe('API Key Auth Provider', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await buildApp(ApiKeyAuthProviderFixture);
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('GET /me with valid API key returns service user', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer apikey:service-account-123')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'service-user',
        sub: 'service-user',
        email: 'service@api.internal',
        claims: { provider: 'apikey', scope: 'full' },
      });
    });

    it('GET /me with wrong API key returns 401', async () => {
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer apikey:wrong-key')
        .expect(401);
    });

    it('GET /me without Authorization header returns 401', async () => {
      await request(app.getHttpServer()).get('/me').expect(401);
    });

    it('GET /me with malformed Authorization header returns 401', async () => {
      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz')
        .expect(401);
    });
  });

  describe('Auth provider hot-swap — different apps, different providers', () => {
    let firebaseApp: INestApplication;
    let apiKeyApp: INestApplication;

    beforeAll(async () => {
      const [fbModule, akModule] = await Promise.all([
        buildApp(FirebaseAuthAdapterFixture),
        buildApp(ApiKeyAuthProviderFixture),
      ]);
      firebaseApp = fbModule.createNestApplication();
      apiKeyApp = akModule.createNestApplication();
      await Promise.all([firebaseApp.init(), apiKeyApp.init()]);
    });

    afterAll(async () => {
      await Promise.all([firebaseApp.close(), apiKeyApp.close()]);
    });

    it('Firebase token works on Firebase app but not on API key app', async () => {
      const token = createFirebaseToken({
        uid: 'cross-test-user',
        email: 'cross@test.com',
      });

      await request(firebaseApp.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(apiKeyApp.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('API key works on API key app but not on Firebase app', async () => {
      await request(apiKeyApp.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer apikey:service-account-123')
        .expect(200);

      await request(firebaseApp.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer apikey:service-account-123')
        .expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Chain (NEW): multiple adapters on different transports coexist in
  // the same app. Proves the `auth: [...]` array form + the
  // adapter-owns-its-wire-format design.
  //
  //   chain = [XApiKeyHeaderAuthAdapterFixture, FirebaseAuthAdapterFixture]
  //
  // - `X-API-Key: xapi-secret-1`          → first adapter authenticates.
  // - `Authorization: Bearer firebase:…`  → first adapter says
  //                                          `matched: false` (no
  //                                          `X-API-Key` header),
  //                                          chain falls through to
  //                                          Firebase adapter.
  // - `X-API-Key: wrong`                  → first adapter says
  //                                          `matched: true, error`,
  //                                          chain STOPS (we do not
  //                                          try the Bearer adapter on
  //                                          a credential the API-key
  //                                          adapter already claimed).
  // ─────────────────────────────────────────────────────────────────
  describe('Chain (auth: array) — multi-transport coexistence', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await buildChainApp([
        XApiKeyHeaderAuthAdapterFixture,
        FirebaseAuthAdapterFixture,
      ]);
      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('first adapter (X-API-Key) authenticates when its header is present', async () => {
      const res = await request(app.getHttpServer())
        .get('/me')
        .set('X-API-Key', 'xapi-secret-1')
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'xapi-user',
        sub: 'xapi-user',
        claims: { provider: 'x-api-key' },
      });
    });

    it('falls through to the next adapter (Firebase) when the first signals matched:false', async () => {
      const token = createFirebaseToken({
        uid: 'chain-user-1',
        email: 'chain@firebase.test',
        roles: ['editor'],
      });

      const res = await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        id: 'chain-user-1',
        claims: { provider: 'firebase' },
      });
    });

    it('stops the chain when the first adapter claims but rejects the credential', async () => {
      // X-API-Key adapter sees the header, deems it invalid → 401.
      // The Firebase adapter MUST NOT be consulted, because doing so
      // would be a surprising passthrough on a credential the X-API-Key
      // adapter already owned.
      await request(app.getHttpServer())
        .get('/me')
        .set('X-API-Key', 'wrong-key')
        .expect(401);
    });

    it('rejects when neither adapter recognises the request', async () => {
      // No `X-API-Key`, no `Authorization` → both adapters return
      // `matched: false`, guard throws the generic 401.
      await request(app.getHttpServer()).get('/me').expect(401);
    });

    it('order matters: swapping the chain swaps which adapter wins', async () => {
      // Same two adapters, opposite order. With the Bearer adapter
      // first, a `Bearer firebase:…` token still wins via Firebase
      // (X-API-Key adapter says matched:false on it); the X-API-Key
      // path still works because it reads a different header.
      const reverseModule = await buildChainApp([
        FirebaseAuthAdapterFixture,
        XApiKeyHeaderAuthAdapterFixture,
      ]);
      const reverseApp = reverseModule.createNestApplication();
      await reverseApp.init();
      try {
        await request(reverseApp.getHttpServer())
          .get('/me')
          .set(
            'Authorization',
            `Bearer ${createFirebaseToken({ uid: 'reverse-user' })}`,
          )
          .expect(200);

        await request(reverseApp.getHttpServer())
          .get('/me')
          .set('X-API-Key', 'xapi-secret-1')
          .expect(200);
      } finally {
        await reverseApp.close();
      }
    });
  });
});
