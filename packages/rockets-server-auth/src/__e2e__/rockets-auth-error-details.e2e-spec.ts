import { describe, it, expect, afterAll } from 'vitest';
import 'reflect-metadata';

import {
  BadRequestException,
  Controller,
  Get,
  INestApplication,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import {
  AuthPublic,
  attachErrorDetails,
  detailedErrorSerializer,
} from '@concepta/rockets-core';

import {
  applyRocketsAuthE2eAppGlobals,
  createRocketsAuthStandardE2eTestingModule,
  type CreateRocketsAuthStandardE2eModuleOptions,
} from './helpers/rockets-auth-e2e-app.factory';
import {
  userMetadataValidatedResponseSchemaFixture,
  userMetadataValidatedUpdateSchemaFixture,
} from '../__fixtures__/user/user-metadata-validated.schema.fixture';
import { UserMetadataEntityFixture } from '../__fixtures__/user/user-metadata.entity.fixture';

/**
 * #87 — an auth-composed app (RocketsModule + defineRocketsAuth) used to
 * run a compatibility filter that never read the `details` symbol and
 * had no serializer seam, so structured validation details (#55) never
 * reached it even though core/server apps already had them. The compat
 * filter is gone; the global filter here is the same
 * `RocketsCoreExceptionsFilter` core and server use.
 */
@Controller('test-errors')
@ApiTags('Test')
class TestAuthErrorController {
  @Get('bad-request-with-details')
  @AuthPublic()
  @ApiOkResponse({ description: 'Always throws — test route' })
  badRequestWithDetails(): never {
    throw attachErrorDetails(
      new BadRequestException({
        statusCode: 400,
        message: 'ref must be unique',
        error: 'Bad Request',
      }),
      [{ path: ['ref'], message: 'must be unique' }],
    );
  }

  @Get('runtime-500-with-details')
  @AuthPublic()
  @ApiOkResponse({ description: 'Always throws — test route' })
  runtime500WithDetails(): never {
    throw attachErrorDetails(new Error('internal: dsn=secret://x'), [
      { path: ['ref'], message: 'internal detail that must not leak' },
    ]);
  }
}

async function bootAuthApp(
  serializer?: Parameters<typeof applyRocketsAuthE2eAppGlobals>[1],
  overrides?: CreateRocketsAuthStandardE2eModuleOptions['rocketsAuthOverrides'],
): Promise<{ app: INestApplication; module: TestingModule }> {
  const module = await createRocketsAuthStandardE2eTestingModule({
    mockEmailService: { sendMail: async () => undefined },
    extraControllers: [TestAuthErrorController],
    ...(overrides ? { rocketsAuthOverrides: overrides } : {}),
  });
  const app = module.createNestApplication();
  applyRocketsAuthE2eAppGlobals(app, serializer);
  await app.init();
  return { app, module };
}

describe('RocketsAuth error details (e2e) — #87 compat filter parity', () => {
  const apps: INestApplication[] = [];

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('default serializer: byte-shape unchanged, no details key', async () => {
    const { app } = await bootAuthApp();
    apps.push(app);

    const res = await request(app.getHttpServer())
      .get('/test-errors/bad-request-with-details')
      .expect(400);

    // The WHOLE envelope, not just `message` and the absence of
    // `details`. Asserting two of five facts would stay green while a
    // serializer that dropped `errorCode` broke the byte-shape
    // compatibility this PR exists to protect. Route is deliberately
    // the details-BEARING one: a 400 that can never carry details
    // would pass even if the default serializer started spreading them.
    expect(Object.keys(res.body).sort()).toEqual([
      'errorCode',
      'message',
      'statusCode',
      'timestamp',
    ]);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.errorCode).toBe('HTTP_BAD_REQUEST');
    expect(res.body.message).toBe('ref must be unique');
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('detailedErrorSerializer: details reach an auth-composed app', async () => {
    const { app } = await bootAuthApp(detailedErrorSerializer);
    apps.push(app);

    const res = await request(app.getHttpServer())
      .get('/test-errors/bad-request-with-details')
      .expect(400);

    expect(res.body.details).toEqual([
      { path: ['ref'], message: 'must be unique' },
    ]);
    // `details` is APPENDED to the default envelope, not a replacement
    // for it — the opt-in must not cost a consumer the four keys.
    expect(Object.keys(res.body).sort()).toEqual([
      'details',
      'errorCode',
      'message',
      'statusCode',
      'timestamp',
    ]);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.errorCode).toBe('HTTP_BAD_REQUEST');
    expect(res.body.message).toBe('ref must be unique');
  });

  it('masks details on a 5xx', async () => {
    const { app } = await bootAuthApp(detailedErrorSerializer);
    apps.push(app);

    const res = await request(app.getHttpServer())
      .get('/test-errors/runtime-500-with-details')
      .expect(500);

    expect(res.body.details).toBeUndefined();
    // The masking is only worth anything if the leak-bearing strings
    // are absent from the WHOLE body, not just from a `details` key.
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('dsn=secret');
    expect(serialized).not.toContain('internal detail that must not leak');
    expect(res.body.statusCode).toBe(500);
    expect(res.body.message).toBe('Internal Server Error');
  });
});

/**
 * The synthetic controller above proves the FILTER reaches an
 * auth-composed app. It does not prove any Rockets code actually MINTS
 * details on a route a real consumer calls — the seal's point.
 *
 * `PATCH /me` is that route: its body is `@Body({ schema })`-validated by
 * Nest's Standard Schema pipe with the Rockets exception factory, which
 * raises the `BadRequestException` carrying
 * `standardSchemaIssuesToDetails` findings via `attachErrorDetails`.
 * The controller is registered in this exact app: `defineRocketsAuth`
 * sets `identity.userMetadata`, which is what makes `RocketsModule`
 * mount the `/me` controller.
 *
 * (The other production minter — the invitation-acceptance listener's
 * `validateWithSchema` — is NOT reachable over HTTP: its event is
 * published from an `onCommit` callback flushed with
 * `Promise.allSettled`, `commit()` is a synchronous `void`,
 * `EventBus.bind` swallows handler errors, and the listener itself
 * catches to honour the event-listener contract. That endpoint returns
 * 200 whatever the metadata payload does. Three of those four barriers
 * are upstream. Documented rather than worked around.)
 */
describe('RocketsAuth error details (e2e) — real production minter: PATCH /me', () => {
  const apps: INestApplication[] = [];
  const credentials = {
    email: 'me-details-e2e@example.com',
    username: 'me-details-e2e',
    active: true,
    password: 'OriginalP@ssw0rd',
  };

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  async function bootWithValidatingMetadata(
    serializer?: Parameters<typeof applyRocketsAuthE2eAppGlobals>[1],
  ): Promise<{ app: INestApplication; token: string }> {
    const { app } = await bootAuthApp(serializer, {
      userMetadata: {
        entity: UserMetadataEntityFixture,
        updateSchema: userMetadataValidatedUpdateSchemaFixture,
        responseSchema: userMetadataValidatedResponseSchemaFixture,
      },
    });
    apps.push(app);

    await request(app.getHttpServer())
      .post('/signup')
      .send(credentials)
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username: credentials.username, password: credentials.password })
      .expect(200);

    return { app, token: login.body.accessToken as string };
  }

  it('detailedErrorSerializer: schema issues reach the response with their nested path', async () => {
    const { app, token } = await bootWithValidatingMetadata(
      detailedErrorSerializer,
    );

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      // Well-typed values that still violate a range: a 12-char string is
      // over `.max(5)`, and 999 is over `.max(150)`.
      .send({ userMetadata: { firstName: 'far-too-long', age: 999 } })
      .expect(400);

    // Each detail names the FULL path from the body root — the nested
    // `userMetadata` segment is what lets a client highlight the field.
    expect(res.body.details).toEqual([
      {
        path: ['userMetadata', 'firstName'],
        message: 'Too big: expected string to have <=5 characters',
      },
      {
        path: ['userMetadata', 'age'],
        message: 'Too big: expected number to be <=150',
      },
    ]);
    expect(res.body.statusCode).toBe(400);
    expect(res.body.errorCode).toBe('HTTP_BAD_REQUEST');
  });

  it('default serializer: the same route keeps the four-key envelope', async () => {
    const { app, token } = await bootWithValidatingMetadata();

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { firstName: 'far-too-long', age: 999 } })
      .expect(400);

    expect(Object.keys(res.body).sort()).toEqual([
      'errorCode',
      'message',
      'statusCode',
      'timestamp',
    ]);
  });

  it('a valid payload still succeeds — the 400 above is validation, not wiring', async () => {
    const { app, token } = await bootWithValidatingMetadata(
      detailedErrorSerializer,
    );

    const res = await request(app.getHttpServer())
      .patch('/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ userMetadata: { firstName: 'Ana', age: 33 } })
      .expect(200);

    expect(res.body.userMetadata.firstName).toBe('Ana');
    expect(res.body.userMetadata.age).toBe(33);
  });

  /**
   * Issue #103, closed by the schema engine: the class-DTO default
   * (`RocketsAuthUserMetadataDto`) carried no validator metadata, so the
   * old whitelist helper rejected EVERY payload — `{}` included — and an
   * auth app that never subclassed had no working `PATCH /me`. The
   * default is now `rocketsAuthUserMetadataUpdateSchema`, an empty
   * object schema: every payload validates, and keys the app never
   * declared are stripped rather than persisted.
   */
  it('#103 closed: PATCH /me accepts every payload with the default metadata schema', async () => {
    const { app } = await bootAuthApp();
    apps.push(app);

    const creds = {
      email: 'me-default-dto-e2e@example.com',
      username: 'me-default-dto-e2e',
      active: true,
      password: 'OriginalP@ssw0rd',
    };
    await request(app.getHttpServer()).post('/signup').send(creds).expect(201);
    const login = await request(app.getHttpServer())
      .post('/token/password')
      .send({ username: creds.username, password: creds.password })
      .expect(200);
    const token = login.body.accessToken as string;

    for (const body of [
      {},
      { userMetadata: {} },
      { userMetadata: { firstName: 'Ana' } },
    ]) {
      const res = await request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);

      // Undeclared keys never reach the row, and the response projects
      // only the base metadata columns.
      expect(res.body.userMetadata).not.toHaveProperty('firstName');
      expect(res.body.userMetadata.userId).toBe(res.body.id);
    }
  });
});
