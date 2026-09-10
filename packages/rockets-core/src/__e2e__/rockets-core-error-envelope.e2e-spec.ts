/**
 * E2E coverage for the pluggable error envelope (issue #55).
 *
 * The filter hardcoded `{ statusCode, errorCode, message, timestamp }`,
 * so an app with its own envelope had to re-implement the whole filter —
 * including the `context.originalError` unwrap chain. Miss that chain and
 * every hook `409` becomes a `500`, which is exactly the regression the
 * fork was supposed to avoid.
 *
 * These specs pin both halves:
 *
 *  1. A custom serializer changes the BODY and nothing else — the hook
 *     `409` is still a `409`, and validation still flattens to `400`.
 *  2. Without a serializer the legacy envelope is byte-shape identical.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  PlainLiteralObject,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Global,
  INestApplication,
  Injectable,
  Module,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { getDynamicRepositoryToken, Where } from '@concepta/nestjs-repository';
import request from 'supertest';
import { z } from 'zod';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { USER_METADATA_MODULE_ENTITY_KEY } from '../rockets-core.constants';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { RocketsCoreExceptionsFilter } from '../infrastructure/filters/exceptions.filter';
import {
  defaultErrorSerializer,
  detailedErrorSerializer,
  ROCKETS_ERROR_SERIALIZER_TOKEN,
  type RocketsErrorContext,
  type RocketsErrorSerializerInterface,
} from '../infrastructure/filters/error-serializer';
import { defineResource } from '../infrastructure/resource/define-resource';
import { RuntimeException, withOpenApi } from '@concepta/nestjs-core';
import { attachErrorDetails } from '../common/utils/validation-error-details.util';
import { baseEntity, f, zodResource } from '../zod';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';
import { defineHook } from '../infrastructure/hooks/define-hook';
import {
  EntityHook,
  PassthroughEntityHookBase,
} from '../infrastructure/hooks/entity-hook';

// ── Fixtures ──

@Injectable()
class StubAuthAdapter implements AuthAdapterInterface {
  async authenticate(req: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(req);
    if (token === null) return { matched: false };
    if (token === 'u1') return { matched: true, user: { id: 'u1', sub: 'u1' } };
    return { matched: true, error: new UnauthorizedException() };
  }
}

@Entity('envelope_notes')
class NoteEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) ref!: string;
}

const noteCreateSchema = withOpenApi(
  z.object({ ref: z.string() }),
  'NoteCreateDto',
);
const noteResponseSchema = withOpenApi(
  z.object({ id: z.uuid(), ref: z.string() }),
  'NoteResponseDto',
);

class StubMetadataRepo {
  async findOne() {
    return null;
  }
  async create(data: Record<string, unknown>) {
    return { id: '1', ...data };
  }
  async update(e: Record<string, unknown>, d: Record<string, unknown>) {
    return { ...e, ...d };
  }
}

const metaToken = getDynamicRepositoryToken(USER_METADATA_MODULE_ENTITY_KEY);

@Global()
@Module({
  providers: [{ provide: metaToken, useValue: new StubMetadataRepo() }],
  exports: [metaToken],
})
class MetaModule {}

/**
 * Rejects a duplicate `ref` with a `ConflictException` raised INSIDE a
 * repository hook — the path that reaches the filter wrapped in the
 * repository/CRUD chain, which is what a naive envelope fork loses.
 */
const NoteUniqueHook = defineHook<NoteEntity>(NoteEntity, {
  async beforeCreate(payload, ctx, { repo }) {
    const ref = typeof payload.ref === 'string' ? payload.ref : '';
    const existing = await repo.findOne({
      where: Where.eq<NoteEntity>('ref', ref),
      ctx,
    });
    // Details attached INSIDE the repository membrane, after an await —
    // the same shape as the Conflict below, which is the path the
    // upstream wrap chain preserves `originalError` on. This exception
    // gets wrapped before the filter unwraps it: the spot where the
    // symbol could silently disappear if a wrapper ever cloned instead
    // of referencing. The e2e pins that it survives.
    if (ref === 'forbidden-ref') {
      throw attachErrorDetails(
        new BadRequestException({
          statusCode: 400,
          message: 'ref "forbidden-ref" is reserved',
          error: 'Bad Request',
        }),
        [{ path: ['ref'], message: 'this ref is reserved' }],
      );
    }
    // The NON-HttpException carrier: the documented hook guidance is to
    // throw a RuntimeException subclass with an httpStatus. Details on
    // this shape are only reachable because the filter reads the symbol
    // for EVERY exception type — revert that hoist and this route loses
    // its details while the BadRequest one above keeps them.
    if (ref === 'runtime-ref') {
      const runtime = new RuntimeException({
        message: 'ref "runtime-ref" is rejected',
        safeMessage: 'ref "runtime-ref" is rejected',
        httpStatus: 400,
      });
      throw attachErrorDetails(runtime, [
        { path: ['ref'], message: 'runtime-rejected' },
      ]);
    }
    if (ref === 'explode-ref') {
      // An HttpException(500) with attached details: the unwrap FINDS
      // this one, so the details are readable — which is exactly what
      // makes the 5xx gate load-bearing. A plain Error would bury the
      // symbol under wrappers nothing reads, and a test against it
      // passes with the gate deleted (it did — caught by mutation).
      throw attachErrorDetails(
        new InternalServerErrorException('internal: dsn=secret://x'),
        [{ path: ['ref'], message: 'internal detail that must not leak' }],
      );
    }
    if (existing) throw new ConflictException(`ref "${ref}" is already taken`);
    return payload;
  },
});

const noteResource = defineResource<NoteEntity>({
  key: 'note',
  entity: NoteEntity,
  path: 'notes',
  tags: ['Notes'],
  hooks: [NoteUniqueHook],
  operations: {
    read: { output: noteResponseSchema },
    create: { input: noteCreateSchema, output: noteResponseSchema },
  },
});

@Entity('envelope_zotes')
class ZoteEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar' }) label!: string;
  // `baseEntity` declares both, and the response schema validates them —
  // without the columns a successful create serializes to a 500. No test
  // exercised a passing `/zotes` create before, so the gap was invisible.
  @CreateDateColumn() dateCreated!: Date;
  @UpdateDateColumn() dateUpdated!: Date;
}

/**
 * A CLASS hook, not `defineHook`. Until `8.0.0-alpha.10` the docs told
 * class-hook authors to throw `RepositoryQueryException` directly,
 * because only `defineHook` could pre-wrap an `HttpException` so the
 * membrane preserved it. That contract is gone: upstream's
 * `RepositoryQueryException` now keeps `context.originalError`, so a
 * class hook throws its own domain exception like everything else.
 * Nothing pinned that, which is how the removal could have regressed
 * silently.
 */
@EntityHook({ entity: ZoteEntity })
@Injectable()
class ZoteLabelGuardHook extends PassthroughEntityHookBase<PlainLiteralObject> {
  override async beforeCreate(
    payload: PlainLiteralObject,
  ): Promise<PlainLiteralObject> {
    if (payload.label === 'reserved') {
      throw new ConflictException('label "reserved" is not available');
    }
    if (payload.label === 'forbidden') {
      throw new ForbiddenException('label "forbidden" is not yours');
    }
    return payload;
  }
}

/**
 * Zod-path sibling of the notes resource: its 400s come from
 * `standardSchemaBadRequest` — the producer #55 asked to make
 * machine-readable — where the class-validator CRUD path's 400s are
 * minted by the upstream pipe and carry messages only.
 */
const zoteResource = zodResource({
  name: 'Zote',
  schema: baseEntity({ label: f.string() }),
  entity: ZoteEntity,
  path: 'zotes',
  tags: ['Zotes'],
  operations: { create: true, read: true },
  hooks: [ZoteLabelGuardHook],
});

/** An app envelope that shares no keys with the Rockets default. */
class TicketEnvelopeSerializer implements RocketsErrorSerializerInterface {
  serialize({ statusCode, errorCode, message }: RocketsErrorContext) {
    return {
      ok: false,
      error: { kind: errorCode, detail: message },
      http: statusCode,
    };
  }
}

/**
 * The pattern the docs recommend. It only compiles because `serialize`
 * returns an object type — a spread of `unknown` is a type error, so
 * this class IS the regression test for that signature.
 */
class ExtendedEnvelopeSerializer implements RocketsErrorSerializerInterface {
  serialize(context: RocketsErrorContext) {
    return { ...defaultErrorSerializer.serialize(context), traceId: 'trace-1' };
  }
}

/** Returns nothing — the filter must not send an empty body. */
class BrokenSerializer implements RocketsErrorSerializerInterface {
  serialize(): never {
    return undefined as never;
  }
}

async function bootstrap(
  serializer: RocketsErrorSerializerInterface | undefined,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'sqlite',
        database: ':memory:',
        entities: [NoteEntity, ZoteEntity],
        synchronize: true,
        dropSchema: true,
      }),
      MetaModule,
      RocketsCoreModule.forRoot({
        auth: defineAuthAdapter(StubAuthAdapter),
        providers: [StubAuthAdapter],
        repository: TypeOrmRepositoryModule,
        resources: [noteResource, zoteResource],
        global: true,
      }),
    ],
    providers: [
      { provide: APP_GUARD, useClass: AuthServerGuard },
      { provide: APP_FILTER, useClass: RocketsCoreExceptionsFilter },
      ...(serializer
        ? [{ provide: ROCKETS_ERROR_SERIALIZER_TOKEN, useValue: serializer }]
        : []),
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

/** Same app, NO exception filter — Nest's default replies. */
async function bootstrapWithoutFilter(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot({
        type: 'sqlite',
        database: ':memory:',
        entities: [NoteEntity, ZoteEntity],
        synchronize: true,
        dropSchema: true,
      }),
      MetaModule,
      RocketsCoreModule.forRoot({
        auth: defineAuthAdapter(StubAuthAdapter),
        providers: [StubAuthAdapter],
        repository: TypeOrmRepositoryModule,
        resources: [noteResource, zoteResource],
        global: true,
      }),
    ],
    providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

// ── Specs ──

describe('custom error envelope via ROCKETS_ERROR_SERIALIZER_TOKEN (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrap(new TicketEnvelopeSerializer());
    await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'taken' })
      .expect(201);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('keeps a hook ConflictException at 409 and shapes the body', async () => {
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'taken' })
      .expect(409);

    expect(res.body).toEqual({
      ok: false,
      error: { kind: expect.any(String), detail: expect.anything() },
      http: 409,
    });
    // The default keys must be gone, not merged alongside.
    expect(res.body.statusCode).toBeUndefined();
    expect(res.body.timestamp).toBeUndefined();
  });

  it('shapes validation failures and keeps them at 400', async () => {
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 42 })
      .expect(400);

    expect(res.body.http).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('shapes an unauthenticated request and keeps it at 401', async () => {
    const res = await request(app.getHttpServer())
      .get('/notes/00000000-0000-0000-0000-000000000000')
      .expect(401);

    expect(res.body.http).toBe(401);
  });

  // The CLASS-hook half. `defineHook` is sugar; a hand-written
  // `@EntityHook` class goes through the same membrane and must reach
  // the client with the same status. This is what the removed
  // "class hooks should throw RepositoryQueryException directly"
  // contract used to work around.
  it('keeps a CLASS hook ConflictException at 409', async () => {
    const res = await request(app.getHttpServer())
      .post('/zotes')
      .set('Authorization', 'Bearer u1')
      .send({ label: 'reserved' })
      .expect(409);

    expect(res.body.http).toBe(409);
    expect(res.body.ok).toBe(false);
  });

  it('keeps a CLASS hook ForbiddenException at 403', async () => {
    const res = await request(app.getHttpServer())
      .post('/zotes')
      .set('Authorization', 'Bearer u1')
      .send({ label: 'forbidden' })
      .expect(403);

    expect(res.body.http).toBe(403);
  });

  it('lets a class hook pass a legitimate create through', async () => {
    await request(app.getHttpServer())
      .post('/zotes')
      .set('Authorization', 'Bearer u1')
      .send({ label: 'fine' })
      .expect(201);
  });
});

describe('an envelope that extends the default (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrap(new ExtendedEnvelopeSerializer());
    await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'taken' })
      .expect(201);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('keeps the default keys and adds its own', async () => {
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'taken' })
      .expect(409);

    expect(Object.keys(res.body).sort()).toEqual([
      'errorCode',
      'message',
      'statusCode',
      'timestamp',
      'traceId',
    ]);
    expect(res.body.traceId).toBe('trace-1');
  });
});

describe('a serializer that returns nothing (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrap(new BrokenSerializer());
    await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'taken' })
      .expect(201);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('falls back to the default body instead of replying empty', async () => {
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'taken' })
      .expect(409);

    expect(res.body.statusCode).toBe(409);
    expect(res.body.errorCode).toBeDefined();
  });
});

describe('default error envelope is unchanged (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await bootstrap(undefined);
    await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'taken' })
      .expect(201);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('replies with the legacy four-key envelope', async () => {
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'taken' })
      .expect(409);

    expect(Object.keys(res.body).sort()).toEqual([
      'errorCode',
      'message',
      'statusCode',
      'timestamp',
    ]);
    expect(res.body.statusCode).toBe(409);
  });

  it('exports the default serializer so an envelope can extend it', () => {
    // No cast: `serialize` returns an object type, which is what makes
    // the documented `{ ...default.serialize(ctx), traceId }` pattern
    // compile at all.
    const body = defaultErrorSerializer.serialize({
      statusCode: 418,
      errorCode: 'TEAPOT',
      message: 'short and stout',
      originalException: new Error('wrapped by the repository membrane'),
    });

    expect(body.statusCode).toBe(418);
    expect(body.errorCode).toBe('TEAPOT');
    expect(typeof body.timestamp).toBe('string');
  });
});
// ── #55 residuals: structured details + the request in the context ──

describe('structured error details and request context (e2e)', () => {
  let app: INestApplication;
  /** What the serializer saw, captured per request for assertions. */
  const seen: { ctx?: RocketsErrorContext } = {};
  // Read through a call: TS control-flow narrows `seen.ctx` to the
  // literal `undefined` written before the request, blind to the
  // serializer's assignment inside the awaited call.
  const captured = (): RocketsErrorContext | undefined => seen.ctx;

  class CapturingSerializer implements RocketsErrorSerializerInterface {
    serialize(context: RocketsErrorContext) {
      seen.ctx = context;
      return {
        ...detailedErrorSerializer.serialize(context),
        requestId: String(context.request?.headers['x-request-id'] ?? ''),
      };
    }
  }

  beforeAll(async () => {
    app = await bootstrap(new CapturingSerializer());
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // The field report's exact complaint: apps had to PARSE the flattened
  // "field: message" strings. `details` is the machine-readable channel
  // — path as an ARRAY (index 0 and key "0" differ), message verbatim.
  it('a zod validation 400 carries structured details', async () => {
    const res = await request(app.getHttpServer())
      .post('/zotes')
      .set('Authorization', 'Bearer u1')
      .set('x-request-id', 'req-9')
      .send({})
      .expect(400);

    expect(res.body.details).toEqual([
      expect.objectContaining({ path: ['label'] }),
    ]);
    // And the serializer could build a correlation id without forking
    // the filter — the #55(b) half.
    expect(res.body.requestId).toBe('req-9');
  });

  it('hands the serializer the typed request facade', async () => {
    seen.ctx = undefined;
    await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .set('x-request-id', 'req-10')
      .send({})
      .expect(400);

    expect(captured()?.request?.headers['x-request-id']).toBe('req-10');
    expect(captured()?.request?.raw).toBeDefined();
  });

  it('details on a RuntimeException carrier reach the serializer (the hoist)', async () => {
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'runtime-ref' })
      .expect(400);

    expect(res.body.details).toEqual([
      { path: ['ref'], message: 'runtime-rejected' },
    ]);
  });

  // A 5xx must mask details exactly as it masks message: an attached
  // finding quoting an internal error is not client-safe.
  it('a 5xx never emits details', async () => {
    seen.ctx = undefined;
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'explode-ref' })
      .expect(500);
    expect(res.body.details).toBeUndefined();
    expect(captured()?.details).toBeUndefined();
  });

  // F4 from review: every other producer throws BEFORE the repository
  // membrane, so unwrapped === raw in all of them and the two-operand
  // read was undiscriminated. This one is wrapped and unwrapped.
  it('details survive the repository wrap/unwrap chain', async () => {
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'forbidden-ref' })
      .expect(400);

    expect(res.body.details).toEqual([
      { path: ['ref'], message: 'this ref is reserved' },
    ]);
  });

  it('a non-validation error carries no details', async () => {
    await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'dup' })
      .expect(201);
    seen.ctx = undefined;
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'dup' })
      .expect(409);

    expect(res.body.details).toBeUndefined();
    expect(captured()?.details).toBeUndefined();
  });

  it('the default envelope stays byte-shape identical without opt-in', async () => {
    const plain = await bootstrap(undefined);
    // The details-BEARING route, deliberately: asserting on a route
    // whose 400 can never carry details would stay green even if the
    // default serializer started spreading them — decoration, not
    // proof. Caught in review.
    const res = await request(plain.getHttpServer())
      .post('/zotes')
      .set('Authorization', 'Bearer u1')
      .send({})
      .expect(400);
    await plain.close();

    expect(Object.keys(res.body).sort()).toEqual([
      'errorCode',
      'message',
      'statusCode',
      'timestamp',
    ]);
  });

  // The symbol carrier's whole point: an app that never registered the
  // Rockets filter must see the body Nest has always produced. An
  // earlier revision rode `details` on the exception PAYLOAD, which
  // Nest's default filter replies with verbatim — every no-filter app's
  // 400 changed shape with no opt-in.
  it('an app WITHOUT the Rockets filter sees the unchanged Nest body', async () => {
    const bare = await bootstrapWithoutFilter();
    const res = await request(bare.getHttpServer())
      .post('/zotes')
      .set('Authorization', 'Bearer u1')
      .send({})
      .expect(400);
    await bare.close();

    expect(Object.keys(res.body).sort()).toEqual([
      'error',
      'message',
      'statusCode',
    ]);
  });

  it('builds the request facade even on a pre-routing 401', async () => {
    seen.ctx = undefined;
    await request(app.getHttpServer()).post('/zotes').send({}).expect(401);
    expect(captured()?.request?.headers).toBeDefined();
    expect(captured()?.request?.params).toEqual({});
  });
});

/**
 * A serializer that THROWS must not replace every error response with
 * the adapter's bare 500: the filter falls back to the default
 * envelope, same as the null-return case. Without the guard, a
 * serializer bug rewrites even a routine hook 409 into an unreadable
 * 500 — a second failure inside the error path.
 */
describe('a serializer that throws (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    class ThrowingSerializer implements RocketsErrorSerializerInterface {
      serialize(): PlainLiteralObject {
        throw new Error('serializer bug');
      }
    }
    app = await bootstrap(new ThrowingSerializer());
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('falls back to the default envelope and keeps the resolved status', async () => {
    await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'dup-throw' })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post('/notes')
      .set('Authorization', 'Bearer u1')
      .send({ ref: 'dup-throw' })
      .expect(409);

    expect(res.body).toMatchObject({ statusCode: 409 });
    expect(typeof res.body.errorCode).toBe('string');
    expect(typeof res.body.timestamp).toBe('string');
  });
});
