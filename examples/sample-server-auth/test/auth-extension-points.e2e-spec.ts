import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CommandBus } from '@nestjs/cqrs';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ExceptionsFilter } from '@concepta/rockets';
import { CreateRoleCommand } from '@concepta/nestjs-role';
import { ROLE_CRUD_ENTITY_KEY } from '@concepta/rockets-auth';

import { AppModule } from '../src/app.module';

/**
 * Proves the package's extension points do what they promise, on the
 * sample app as configured in `app.module.ts`:
 * - `userCrud.handlers.signupHandler` (SampleSignupHandler): app policy in
 *   front of the built-in signup, failing with an app-owned
 *   RocketsAuthException subclass.
 * - `otp.controller.routes.send.decorators`: a per-route decorator
 *   (stricter rate limit) applied to a generated controller.
 */
describe('Auth extension points (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
    app.useGlobalFilters(new ExceptionsFilter(app.get(HttpAdapterHost)));
    await app.init();

    await app.get(CommandBus).execute(
      new CreateRoleCommand({}, ROLE_CRUD_ENTITY_KEY, {
        name: 'user',
        description: 'Default user role',
      }),
    );
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('signupHandler override rejects a blocked domain with the app exception', async () => {
    const res = await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: 'blocked-user',
        email: 'blocked-user@mailinator.com',
        password: 'StrongP@ssw0rd',
      })
      .expect(403);

    expect(res.body.errorCode).toBe('SAMPLE_SIGNUP_DOMAIN_BLOCKED');
    expect(res.body.message).toContain('mailinator.com');

    // The built-in path still runs for everyone else.
    await request(app.getHttpServer())
      .post('/signup')
      .send({
        username: 'allowed-user',
        email: 'allowed-user@example.com',
        password: 'StrongP@ssw0rd',
      })
      .expect(201);
  });

  it('otp route decorator rate-limits POST /otp beyond the app limit', async () => {
    const send = () =>
      request(app.getHttpServer())
        .post('/otp')
        .send({ email: 'allowed-user@example.com' });

    const first = await send();
    const second = await send();
    const third = await send();

    expect([first.status, second.status]).not.toContain(429);
    expect(third.status).toBe(429);
  });
});
