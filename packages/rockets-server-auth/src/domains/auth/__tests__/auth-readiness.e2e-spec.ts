import 'reflect-metadata';
import type {
  RateLimitResult,
  RateLimitStoreInterface,
} from '@concepta/rockets-core';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  Controller,
  Get,
  INestApplication,
  Injectable,
  Logger,
  Req,
} from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '@concepta/rockets-core';
import { defineAuthAdapter } from '@concepta/rockets-core';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { UserOtpEntityFixture } from '../../../__fixtures__/user/user-otp-entity.fixture';
import { UserFixture } from '../../../__fixtures__/user/user.entity.fixture';
import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
} from '../../../__e2e__/helpers/rockets-auth-e2e-app.factory';

const originalCredentials = {
  email: 'auth-readiness@example.com',
  username: 'auth-readiness',
  active: true,
  password: 'OriginalP@ssw0rd!',
};

@Injectable()
class SecondaryHeaderAuthAdapter implements AuthAdapterInterface {
  authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    if (request.headers['x-secondary-key'] !== 'secondary-secret') {
      return Promise.resolve({ matched: false });
    }
    return Promise.resolve({
      matched: true,
      user: {
        id: 'secondary-user',
        sub: 'secondary-user',
        email: 'secondary@example.com',
        claims: { provider: 'secondary' },
      },
    });
  }
}

@Controller('mixed-auth-probe')
@ApiTags('Test')
class MixedAuthProbeController {
  @Get()
  @ApiOkResponse({ description: 'Authenticated test user' })
  read(@Req() request: { user?: unknown }): unknown {
    return request.user;
  }
}

/**
 * Recovery dispatch is fire-and-forget (the endpoint answers before the OTP
 * row exists), so the flow test polls instead of reading immediately.
 */
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

describe('Rockets Auth 1.0 readiness (e2e)', () => {
  describe('recovery and handler ownership', () => {
    let app: INestApplication;
    let module: TestingModule;
    let registrationWarnings: string[] = [];
    const mockEmail = { sendMail: vi.fn().mockResolvedValue(undefined) };

    beforeAll(async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn');

      module = await createRocketsAuthStandardE2eTestingModule({
        mockEmailService: mockEmail,
      });
      app = module.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();

      registrationWarnings = warn.mock.calls
        .flatMap((args) => args)
        .map(String)
        .filter((message) => message.includes('already registered'));
      warn.mockRestore();

      await request(app.getHttpServer())
        .post('/signup')
        .send(originalCredentials)
        .expect(201);
    });

    afterAll(async () => {
      await app.close();
    });

    it('registers every CQRS handler exactly once', () => {
      expect(registrationWarnings).toEqual([]);
    });

    it('resolves the upstream DI tokens the password-port handlers depend on', () => {
      // Hand-copied strings (upstream does not export the constants) — an
      // upstream rename must fail here, not at a production boot.
      expect(module.get('USER_CREDENTIALS_REPOSITORY_TOKEN')).toBeDefined();
      expect(module.get('USER_MODULE_SETTINGS_TOKEN')).toBeDefined();
    });

    it('rejects existing access and refresh tokens after user deactivation', async () => {
      const credentials = {
        email: 'inactive-token@example.com',
        username: 'inactive-token',
        active: true,
        password: 'InactiveP@ssw0rd!',
      };
      await request(app.getHttpServer())
        .post('/signup')
        .send(credentials)
        .expect(201);

      const login = await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: credentials.username,
          password: credentials.password,
        })
        .expect(200);
      const accessToken = login.body.accessToken as string;
      const refreshToken = login.body.refreshToken as string;

      await module
        .get(DataSource)
        .getRepository(UserFixture)
        .update({ email: credentials.email }, { active: false });

      await request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/token/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('supports the complete account-recovery flow without disclosing unknown emails', async () => {
      await request(app.getHttpServer())
        .post('/recovery/login')
        .send({ email: originalCredentials.email })
        .expect(200);

      await request(app.getHttpServer())
        .post('/recovery/login')
        .send({ email: 'unknown@example.com' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/recovery/password')
        .send({ email: originalCredentials.email })
        .expect(200);

      const otpRepository = module
        .get(DataSource)
        .getRepository(UserOtpEntityFixture);
      const otp = await pollUntil(
        () => otpRepository.findOneBy({ active: true }),
        'the recovery OTP row',
      );

      await request(app.getHttpServer())
        .post('/recovery/passcode')
        .send({ passcode: otp.passcode })
        .expect(200);

      // The v7 surface leaked the passcode in the URL. Validation is POST-only
      // now, so the old GET route must stay unmounted.
      await request(app.getHttpServer())
        .get(`/recovery/passcode/${otp.passcode}`)
        .expect(404);

      const newPassword = 'RecoveredP@ssw0rd!';
      const resetResponse = await request(app.getHttpServer())
        .patch('/recovery/password')
        .send({ passcode: otp.passcode, newPassword });
      expect(resetResponse.status, JSON.stringify(resetResponse.body)).toBe(
        200,
      );

      await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: originalCredentials.username, password: newPassword })
        .expect(200);
    });
  });

  describe('mixed authentication guard ownership', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const module = await createRocketsAuthStandardE2eTestingModule({
        mockEmailService: { sendMail: vi.fn().mockResolvedValue(undefined) },
        rocketsAuthOverrides: {
          rocketsDefaults: { enableGlobalGuard: true },
        },
        additionalAuth: [defineAuthAdapter(SecondaryHeaderAuthAdapter)],
        extraControllers: [MixedAuthProbeController],
      });
      app = module.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('accepts a secondary credential through the single Rockets guard', async () => {
      const response = await request(app.getHttpServer())
        .get('/mixed-auth-probe')
        .set('X-Secondary-Key', 'secondary-secret')
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'secondary-user',
        claims: { provider: 'secondary' },
      });
    });

    it('accepts the built-in JWT credential through the same Rockets guard', async () => {
      const credentials = {
        email: 'mixed-built-in@example.com',
        username: 'mixed-built-in',
        active: true,
        password: 'MixedBuiltInP@ssw0rd!',
      };
      await request(app.getHttpServer())
        .post('/signup')
        .send(credentials)
        .expect(201);
      const login = await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: credentials.username,
          password: credentials.password,
        })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get('/mixed-auth-probe')
        .set('Authorization', `Bearer ${String(login.body.accessToken)}`)
        .expect(200);

      expect(response.body).toMatchObject({ email: credentials.email });
    });
  });

  describe('undefined authentication strategy settings', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const module = await createRocketsAuthStandardE2eTestingModule({
        mockEmailService: { sendMail: vi.fn().mockResolvedValue(undefined) },
        factoryExtras: {
          authenticationStrategies: { jwt: undefined },
        },
        extraControllers: [MixedAuthProbeController],
      });
      app = module.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('keeps the default JWT app guard when jwt is explicitly undefined', async () => {
      await request(app.getHttpServer()).get('/mixed-auth-probe').expect(401);
    });
  });

  describe('request throttling', () => {
    let app: INestApplication;
    const mockEmail = { sendMail: vi.fn().mockResolvedValue(undefined) };

    beforeAll(async () => {
      const module = await createRocketsAuthStandardE2eTestingModule({
        mockEmailService: mockEmail,
      });
      app = module.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('enforces the declared login limit', async () => {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await request(app.getHttpServer())
          .post('/token/password')
          .send({ username: 'missing-user', password: 'wrong-password' })
          .expect(401);
      }

      await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: 'missing-user', password: 'wrong-password' })
        .expect(429);
    });

    it('throttles per account, so one account cannot lock another out', async () => {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await request(app.getHttpServer())
          .post('/token/password')
          .send({ username: 'victim-lockout', password: 'wrong-password' })
          .expect(401);
      }

      // The victim's own bucket is now exhausted — proves throttling is active.
      await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: 'victim-lockout', password: 'wrong-password' })
        .expect(429);

      // Same client IP, a different account: its bucket is independent, so the
      // exhausted account cannot deny login to everyone else.
      await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: 'other-account', password: 'wrong-password' })
        .expect(401);
    });

    // Guards run BEFORE pipes, so the key function sees the body the
    // client sent, unknown keys included. A key that preferred `email`
    // over `username` therefore minted a fresh counter per request when a
    // login body carried a decoy `email`, and only the 1000/min ceiling
    // stood between a password-guessing loop and one account.
    it('a decoy body field does not reset the per-account login limit', async () => {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        await request(app.getHttpServer())
          .post('/token/password')
          .send({
            username: 'decoy-victim',
            password: 'wrong-password',
            email: `rotating-${attempt}@example.com`,
          })
          .expect(401);
      }

      await request(app.getHttpServer())
        .post('/token/password')
        .send({
          username: 'decoy-victim',
          password: 'wrong-password',
          email: 'yet-another@example.com',
        })
        .expect(429);
    });

    // The same class on a route whose body names NO account. Those routes
    // key the fine dimension on the IP explicitly, because the account key
    // would otherwise be built entirely from fields the client chose —
    // and rotating one would leave a 20/min limit counting one attempt
    // per key.
    it('a decoy body field does not lift the limit on an account-less route', async () => {
      for (let attempt = 1; attempt <= 20; attempt += 1) {
        await request(app.getHttpServer())
          .post('/token/refresh')
          .send({
            refreshToken: 'not-a-token',
            email: `rotating-${attempt}@example.com`,
          })
          .expect(401);
      }

      await request(app.getHttpServer())
        .post('/token/refresh')
        .send({
          refreshToken: 'not-a-token',
          email: 'yet-another@example.com',
        })
        .expect(429);
    });

    // Counters are PER ROUTE, like the engine this replaced (throttler
    // derived its storage key from the handler). The first cut of the
    // swap shared one counter across routes, and eleven failed logins
    // silently consumed the OTP route's 3/min allowance — this pins the
    // isolation explicitly instead of leaving it to the OTP suite to
    // trip over.
    it('an exhausted login bucket does not consume other routes', async () => {
      // `victim-lockout` is 429 on /token/password from the test above…
      await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: 'victim-lockout', password: 'wrong-password' })
        .expect(429);

      // …yet the same (ip, account) pair still has its full OTP budget.
      const res = await request(app.getHttpServer())
        .post('/otp')
        .send({ email: 'victim-lockout@example.com' });
      expect(res.status).not.toBe(429);
    });
  });

  describe('proxy-aware request throttling', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const module = await createRocketsAuthStandardE2eTestingModule({
        mockEmailService: { sendMail: vi.fn().mockResolvedValue(undefined) },
        rocketsAuthOverrides: {
          throttling: {
            ip: { limit: 1, windowMs: 60_000 },
            default: { limit: 100, windowMs: 60_000 },
          },
        },
      });
      app = module.createNestApplication();
      const express = app.getHttpAdapter().getInstance() as {
        set(name: string, value: unknown): void;
      };
      express.set('trust proxy', true);
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('separates trusted forwarded client IP buckets', async () => {
      const login = (ip: string) =>
        request(app.getHttpServer())
          .post('/token/password')
          .set('X-Forwarded-For', ip)
          .send({ username: 'missing-user', password: 'wrong-password' });

      await login('203.0.113.10').expect(401);
      await login('203.0.113.10').expect(429);
      await login('203.0.113.11').expect(401);
    });
  });

  describe('custom throttling store', () => {
    let app: INestApplication;

    // Always rejects: proves the option is honoured end to end — if the
    // default in-memory store were still in play, the first request
    // would pass.
    class RejectEverythingStore implements RateLimitStoreInterface {
      async consume(
        _key: string,
        limit: number,
        _windowMs: number,
      ): Promise<RateLimitResult> {
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt: Date.now() + 60_000,
        };
      }
    }

    beforeAll(async () => {
      const module = await createRocketsAuthStandardE2eTestingModule({
        mockEmailService: { sendMail: vi.fn().mockResolvedValue(undefined) },
        rocketsAuthOverrides: {
          throttling: {
            default: { limit: 100, windowMs: 60_000 },
            store: RejectEverythingStore,
          },
        },
      });
      app = module.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('routes every counter through the supplied store', async () => {
      await request(app.getHttpServer())
        .post('/token/password')
        .send({ username: 'whoever', password: 'wrong-password' })
        .expect(429);
    });
  });

  describe('disabled request throttling', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const module = await createRocketsAuthStandardE2eTestingModule({
        mockEmailService: { sendMail: vi.fn().mockResolvedValue(undefined) },
        rocketsAuthOverrides: { throttling: false },
      });
      app = module.createNestApplication();
      applyRocketsAuthE2eAppGlobals(app);
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('does not rate-limit auth routes when explicitly disabled', async () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await request(app.getHttpServer())
          .post('/token/password')
          .send({ username: 'missing-user', password: 'wrong-password' })
          .expect(401);
      }
    });
  });
});
