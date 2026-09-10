import 'reflect-metadata';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { UserOtpEntityFixture } from '../../../__fixtures__/user/user-otp-entity.fixture';
import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
} from '../../../__e2e__/helpers/rockets-auth-e2e-app.factory';

const credentials = {
  email: 'otp-login@example.com',
  username: 'otp-login',
  active: true,
  password: 'OtpLoginP@ssw0rd!',
};

async function pollUntil<T>(
  read: () => Promise<T | null>,
  what: string,
  timeoutMs = 5000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== null) return value;
    if (Date.now() > deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * Passwordless login: `POST /otp` issues a passcode, `PATCH /otp` burns it
 * and answers with tokens. The confirm step consumes the passcode and THEN
 * issues the tokens on the same request context — the sequence that
 * exposes a finished transaction left on the context (see
 * `RocketsRecoveryService.updatePassword`).
 */
describe('OTP login (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  const mockEmail = { sendMail: vi.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    module = await createRocketsAuthStandardE2eTestingModule({
      mockEmailService: mockEmail,
    });
    app = module.createNestApplication();
    applyRocketsAuthE2eAppGlobals(app);
    await app.init();

    await request(app.getHttpServer())
      .post('/signup')
      .send(credentials)
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues tokens for a valid passcode and burns it', async () => {
    const sent = await request(app.getHttpServer())
      .post('/otp')
      .send({ email: credentials.email });
    expect(sent.status, JSON.stringify(sent.body)).toBeLessThan(300);

    const otpRepository = module
      .get(DataSource)
      .getRepository(UserOtpEntityFixture);
    const otp = await pollUntil(
      () => otpRepository.findOneBy({ active: true }),
      'the login OTP row',
    );

    const confirmed = await request(app.getHttpServer())
      .patch('/otp')
      .send({ email: credentials.email, passcode: otp.passcode });
    expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
    expect(typeof confirmed.body.accessToken).toBe('string');
    expect(typeof confirmed.body.refreshToken).toBe('string');

    await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${confirmed.body.accessToken as string}`)
      .expect(200);

    // The passcode is single-use.
    await request(app.getHttpServer())
      .patch('/otp')
      .send({ email: credentials.email, passcode: otp.passcode })
      .expect(401);
  });

  it('rejects an unknown passcode with 401', async () => {
    await request(app.getHttpServer())
      .patch('/otp')
      .send({ email: credentials.email, passcode: 'not-a-passcode' })
      .expect(401);
  });

  // The app registers no global pipe: the 400 proves the controller's own
  // Standard Schema pipe validates the body (an unknown email would
  // otherwise be answered enumeration-safe with 2xx).
  it('rejects a malformed email with 400 from the schema pipe', async () => {
    const sent = await request(app.getHttpServer())
      .post('/otp')
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(sent.body.errorCode).toBe('HTTP_BAD_REQUEST');

    await request(app.getHttpServer())
      .patch('/otp')
      .send({ email: credentials.email, passcode: '' })
      .expect(400);
  });
});
