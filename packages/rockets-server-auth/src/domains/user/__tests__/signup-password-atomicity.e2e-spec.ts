import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';

import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { PasswordStrengthEnum } from '@concepta/nestjs-password';
import {
  getDynamicRepositoryToken,
  type RepositoryInterface,
} from '@concepta/rockets-core';

import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
} from '../../../__e2e__/helpers/rockets-auth-e2e-app.factory';
import {
  USER_CREDENTIALS_ENTITY_KEY,
  USER_CRUD_ENTITY_KEY,
} from '../../../shared/constants/repository-entity-keys.constants';

/**
 * A rejected password must leave nothing behind.
 *
 * Upstream's `CreateUserHandler` used to save the user row and only THEN
 * dispatch the credential command that checks strength, so a weak password
 * left a persisted, credential-less account — an account nobody can log in
 * to, that also squats the email and username. It survived only when the
 * surrounding transaction rolled it back, which means it was invisible on
 * any adapter with no transaction factory registered.
 *
 * `@concepta/nestjs-user@8.0.0-alpha.11` moved the strength check and hash
 * ahead of the write, so the row is never created in the first place.
 *
 * Scope of this suite, stated plainly: it pins the guarantee, it does not
 * catch the old bug. Both adapters this repo ships (TypeORM and Firestore)
 * register transaction factories, so on alpha.10 the rollback already swept
 * the row away and these assertions would have passed too. The exposure was
 * always on an adapter with no factory registered, where `TransactionScope`
 * fails open — which is exactly why alpha.11 also added a boot-time warning
 * for that configuration.
 */
describe('Signup password atomicity (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  const mockEmail = { sendMail: vi.fn().mockResolvedValue(undefined) };

  const WEAK = 'aaaaaaaa';
  const STRONG = 'Str0ng!P@ssw0rd-2026';

  function users(): RepositoryInterface<{ username: string; email: string }> {
    return app.get(getDynamicRepositoryToken(USER_CRUD_ENTITY_KEY));
  }

  beforeAll(async () => {
    module = await createRocketsAuthStandardE2eTestingModule({
      mockEmailService: mockEmail,
      factoryExtras: {
        passwordSettings: {
          minPasswordStrength: PasswordStrengthEnum.Strong,
        },
      },
    });
    app = module.createNestApplication();
    applyRocketsAuthE2eAppGlobals(app);
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
  });

  it('rejects a weak password', async () => {
    const res = await request(app.getHttpServer()).post('/signup').send({
      username: 'weak-signup',
      email: 'weak-signup@example.com',
      password: WEAK,
      active: true,
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('leaves no user row behind when the password is rejected', async () => {
    const rows = await users().find({});
    expect(rows.some((row) => row.username === 'weak-signup')).toBe(false);
  });

  it('leaves no credential row behind either', async () => {
    const credentials = app.get<RepositoryInterface<{ userId: string }>>(
      getDynamicRepositoryToken(USER_CREDENTIALS_ENTITY_KEY),
    );
    const rows = await users().find({});
    const userIds = new Set(rows.map((row) => (row as { id?: string }).id));
    const orphans = (await credentials.find({})).filter(
      (credential) => !userIds.has(credential.userId),
    );
    expect(orphans).toHaveLength(0);
  });

  it('frees the username and email for a later, valid signup', async () => {
    // The real cost of the old behaviour: the failed attempt squatted the
    // identity, so the same person could never retry with a better password.
    await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: 'weak-signup',
        email: 'weak-signup@example.com',
        password: STRONG,
        active: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/token/password')
      .send({ username: 'weak-signup', password: STRONG })
      .expect(200);
  });
});
