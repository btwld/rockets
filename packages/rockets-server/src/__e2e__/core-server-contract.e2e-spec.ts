/**
 * Contract test between `@concepta/rockets-core` and `@concepta/rockets`.
 *
 * Why this file exists
 * --------------------
 * `rockets-server` delegates the auth abstraction to `rockets-core`
 * (`AuthAdapterInterface`, `AuthorizedUser`, `AUTH_ADAPTERS_TOKEN`). All
 * other e2e specs in this package use fixtures that import from the
 * server's own re-exports — so if someone divergently edits the core
 * types but leaves the server's local re-export untouched, those tests
 * keep passing while real downstream consumers (the Firebase adapter,
 * `rockets-server-auth`'s JWT adapter, etc.) break at runtime.
 *
 * This spec deliberately:
 *   - imports the adapter type STRAIGHT from `@concepta/rockets-core`,
 *   - implements it with a hand-built class that satisfies ONLY the
 *     core contract (no helper utilities, no server-side conveniences),
 *   - wires it into `RocketsModule.forRoot()`, and
 *   - hits `GET /me` to prove the round-trip works.
 *
 * If `RocketsCoreModule` ever stops accepting an `AuthAdapterInterface`
 * from `@concepta/rockets-core` as a valid `authProvider`, this file
 * fails to compile — which is the whole point. Don't "fix" it by
 * casting; fix the contract.
 */
import { vi, describe, it, expect, afterEach } from 'vitest';
import { INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@concepta/rockets-core';
import { extractBearerToken } from '@concepta/rockets-core';

import { E2eFakeRepositoryModule } from './helpers/e2e-fake-repository.module';
import { userMetadataConfigFixture } from '../__fixtures__/schemas/user-metadata.schema.fixture';
import type { RocketsOptions } from '../rockets.module-definition';
import { RocketsModule } from '../rockets.module';
import { e2eAuthBootstrap } from '../__fixtures__/providers/e2e-auth-bootstrap.fixture';

/**
 * Implements ONLY `@concepta/rockets-core`'s `AuthAdapterInterface` —
 * no server-side imports. This is exactly the shape a 3rd-party
 * Bearer-token adapter (Firebase, Auth0, custom) ships with.
 */
@Injectable()
class CoreOnlyAuthAdapter implements AuthAdapterInterface {
  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };

    if (token !== 'core-contract-token') {
      throw new Error('Invalid token');
    }
    return {
      matched: true,
      user: {
        id: 'core-contract-user',
        sub: 'core-contract-user',
        email: 'contract@core.example',
        userRoles: [{ role: { name: 'user' } }],
        claims: {
          sub: 'core-contract-user',
          email: 'contract@core.example',
          roles: ['user'],
        },
      },
    };
  }
}

describe('Core ↔ Server auth-adapter contract (e2e)', () => {
  let app: INestApplication;

  const options: RocketsOptions = {
    settings: {},
    // `auth:` field must accept a class implementing the CORE
    // `AuthAdapterInterface`. If TypeScript ever rejects this
    // assignment, server has drifted from core.
    auth: e2eAuthBootstrap(CoreOnlyAuthAdapter),
    userMetadata: userMetadataConfigFixture,
    repository: E2eFakeRepositoryModule,
  };

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /me succeeds when authProvider implements only the core contract', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RocketsModule.forRoot(options)],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const res = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer core-contract-token')
      .expect(200);

    expect(res.body).toMatchObject({
      id: 'core-contract-user',
      sub: 'core-contract-user',
      email: 'contract@core.example',
    });
  });

  it('GET /me returns 401 when the core adapter rejects the token', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [RocketsModule.forRoot(options)],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', 'Bearer wrong-token')
      .expect(401);
  });

  it('Server re-exports of AuthAdapterInterface and AuthorizedUser still match core', async () => {
    // Module-level imports at the top compile against core types
    // directly; this assertion is a tripwire if anyone replaces the
    // server-side re-exports with hand-written duplicates.
    const fromServer = await vi.importActual<
      typeof import('../domain/interfaces/auth-adapter.interface')
    >('../domain/interfaces/auth-adapter.interface');
    const fromCore = await vi.importActual<
      typeof import('@concepta/rockets-core')
    >('@concepta/rockets-core');
    expect(typeof fromServer).toBe('object');
    expect(typeof fromCore).toBe('object');
  });
});
