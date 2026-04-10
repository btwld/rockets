import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import type { AuthProviderInterface, AuthorizedUser } from '@bitwild/rockets-core';
import type {
  UserMetadataCreatableInterface,
  UserMetadataModelUpdatableInterface,
} from '@bitwild/rockets-core';
import { RocketsModule } from '../rockets.module';
import { RocketsServerE2eUserMetadataRepoModule } from './helpers/rockets-server-e2e-app.factory';

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
 * Validates base64-encoded JSON tokens.
 */
@Injectable()
class FirebaseAuthProviderFixture implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    if (token.startsWith('firebase:')) {
      const payload = token.substring('firebase:'.length);
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { uid: string; email?: string; roles?: string[] };

      return {
        id: decoded.uid,
        sub: decoded.uid,
        email: decoded.email,
        userRoles: decoded.roles?.map((name) => ({ role: { name } })),
        claims: { provider: 'firebase', ...decoded },
      };
    }
    throw new UnauthorizedException('Invalid Firebase token');
  }
}

/**
 * Simulates an API-key auth provider (custom).
 * Validates simple "apikey:<key>" tokens.
 */
@Injectable()
class ApiKeyAuthProviderFixture implements AuthProviderInterface {
  async validateToken(token: string): Promise<AuthorizedUser> {
    if (token === 'apikey:service-account-123') {
      return {
        id: 'service-user',
        sub: 'service-user',
        email: 'service@api.internal',
        userRoles: [{ role: { name: 'service' } }],
        claims: { provider: 'apikey', scope: 'full' },
      };
    }
    throw new UnauthorizedException('Invalid API key');
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
    'firebase:' +
    Buffer.from(JSON.stringify(payload)).toString('base64url')
  );
}

function buildApp(authProvider: AuthProviderInterface) {
  return Test.createTestingModule({
    imports: [
      RocketsServerE2eUserMetadataRepoModule,
      RocketsModule.forRoot({
        authProvider,
        userMetadata: {
          createDto: UserMetadataCreateDto,
          updateDto: UserMetadataUpdateDto,
        },
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
      const moduleRef = await buildApp(new FirebaseAuthProviderFixture());
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
      const moduleRef = await buildApp(new ApiKeyAuthProviderFixture());
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
      await request(app.getHttpServer())
        .get('/me')
        .expect(401);
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
        buildApp(new FirebaseAuthProviderFixture()),
        buildApp(new ApiKeyAuthProviderFixture()),
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
});
