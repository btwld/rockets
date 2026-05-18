import 'reflect-metadata';

import '../../../__e2e__/helpers/patch-crud-module-for-e2e.bootstrap';

import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
} from '../../../__e2e__/helpers/rockets-auth-e2e-app.factory';

/**
 * Verifies the default wiring of `validateHistoryCommand` in
 * `UserModule.forRootAsync` (see `rockets-auth.module-definition.ts`).
 *
 * Flow under test:
 *   PATCH /me/password
 *     → ChangeMyPasswordHandler
 *     → UpdateUserPasswordCommand
 *     → UserCredentialsService.updatePassword()
 *     → validateHistory(): fetches deactivated credentials within
 *       `user.settings.password.reuseAfterDays`
 *     → UserPasswordPort.validateHistory()
 *     → dispatches `validateHistoryCommand` (rockets wires
 *       `ValidatePasswordHistoryCommand` by default)
 *     → upstream `PasswordCreationService.validateHistory()` throws
 *       `PasswordUsedRecentlyException` (HTTP 400,
 *       `PASSWORD_USED_RECENTLY_ERROR`).
 *
 * Without the default wiring (regression scenario), the port's
 * `validateHistory()` is a no-op that returns `true`, and reuse is
 * silently accepted.
 */
describe('PasswordHistory (e2e) — validateHistoryCommand default wiring', () => {
  let app: INestApplication;
  let module: TestingModule;
  const mockEmail = { sendMail: jest.fn().mockResolvedValue(undefined) };

  const credentials = {
    email: 'password-history-e2e@example.com',
    username: 'password-history-e2e',
    active: true,
    password: 'OriginalP@ssw0rd',
  };

  beforeAll(async () => {
    module = await createRocketsAuthStandardE2eTestingModule({
      mockEmailService: mockEmail,
      // Generous window — guarantees the just-deactivated credential is
      // still within the reuse-restriction date when we attempt reuse.
      factoryExtras: {
        userPasswordSettings: { reuseAfterDays: 365 },
      },
    });
    app = module.createNestApplication();
    applyRocketsAuthE2eAppGlobals(app);
    await app.init();

    const signupRes = await request(app.getHttpServer())
      .post('/signup')
      .send(credentials)
      .expect(201);
    expect(signupRes.body).toHaveProperty('id');
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username: credentials.username, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  it('rejects re-using the previous password within reuseAfterDays', async () => {
    const newPassword = 'BrandNewP@ssw0rd!';
    const token = await login(credentials.password);

    // First rotation succeeds — establishes one deactivated credential
    // (the original) in the reuse window.
    await request(app.getHttpServer())
      .patch('/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: credentials.password, newPassword })
      .expect(200);

    // Try to rotate BACK to the original — should fail because it's
    // still inside the reuse window.
    const tokenAfter = await login(newPassword);
    const reuseRes = await request(app.getHttpServer())
      .patch('/me/password')
      .set('Authorization', `Bearer ${tokenAfter}`)
      .send({
        currentPassword: newPassword,
        newPassword: credentials.password,
      });

    expect(reuseRes.status).toBe(400);
    expect(reuseRes.body.errorCode).toBe('PASSWORD_USED_RECENTLY_ERROR');

    // Confirm a brand-new (never-used) password is still accepted —
    // proves the rejection above wasn't a generic block.
    const anotherFresh = 'YetAnotherP@ssw0rd!';
    await request(app.getHttpServer())
      .patch('/me/password')
      .set('Authorization', `Bearer ${tokenAfter}`)
      .send({ currentPassword: newPassword, newPassword: anotherFresh })
      .expect(200);
  });
});
