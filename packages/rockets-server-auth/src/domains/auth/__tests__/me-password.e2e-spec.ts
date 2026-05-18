import 'reflect-metadata';

import '../../../__e2e__/helpers/patch-crud-module-for-e2e.bootstrap';

import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';

import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
} from '../../../__e2e__/helpers/rockets-auth-e2e-app.factory';

describe('MePassword (e2e) — Phase 1 (auth) — change-password flow', () => {
  let app: INestApplication;
  let module: TestingModule;
  const mockEmail = { sendMail: jest.fn().mockResolvedValue(undefined) };

  const credentials = {
    email: 'me-password-e2e@example.com',
    username: 'me-password-e2e',
    active: true,
    password: 'OriginalP@ssw0rd',
  };

  beforeAll(async () => {
    module = await createRocketsAuthStandardE2eTestingModule({
      mockEmailService: mockEmail,
    });
    app = module.createNestApplication();
    applyRocketsAuthE2eAppGlobals(app);
    await app.init();

    // Sign up the user once
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

  it('PATCH /me/password — happy path: changes the password and lets the user log in with the new one', async () => {
    const token = await login(credentials.password);

    await request(app.getHttpServer())
      .patch('/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: credentials.password,
        newPassword: 'NewSecureP@ssw0rd',
      })
      .expect(200);

    // Old password no longer works
    await request(app.getHttpServer())
      .post('/token/password')
      .send({ username: credentials.username, password: credentials.password })
      .expect(401);

    // New password works
    await login('NewSecureP@ssw0rd');

    // Restore for any subsequent test runs
    const newToken = await login('NewSecureP@ssw0rd');
    await request(app.getHttpServer())
      .patch('/me/password')
      .set('Authorization', `Bearer ${newToken}`)
      .send({
        currentPassword: 'NewSecureP@ssw0rd',
        newPassword: credentials.password,
      })
      .expect(200);
  });

  it('PATCH /me/password — rejects wrong current password with 401', async () => {
    const token = await login(credentials.password);
    await request(app.getHttpServer())
      .patch('/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({
        currentPassword: 'totally-wrong-password',
        newPassword: 'AnotherP@ssw0rd',
      })
      .expect(401);
  });

  it('PATCH /me/password — requires authentication', async () => {
    await request(app.getHttpServer())
      .patch('/me/password')
      .send({
        currentPassword: credentials.password,
        newPassword: 'AnotherP@ssw0rd',
      })
      .expect(401);
  });
});
