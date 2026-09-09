import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Controller, Get, INestApplication, Injectable } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  PrimaryColumn,
} from 'typeorm';
import { TypeOrmRepositoryModule } from '@concepta/rockets-repository-typeorm';
import { AppContextHost } from '@concepta/nestjs-core';
import {
  getDynamicRepositoryToken,
  InjectDynamicRepository,
  TransactionScope,
  Where,
  type RepositoryInterface,
} from '@concepta/nestjs-repository';
import request from 'supertest';

import { RocketsCoreModule } from '../rockets-core.module';
import { defineModuleResource } from '../infrastructure/resource/define-module-resource';
import {
  RATE_LIMIT_STORE_TOKEN,
  type RateLimitResult,
  type RateLimitStoreInterface,
} from '../domain/interfaces/rate-limit.interface';
import { RateLimit } from '../decorators/rate-limit.decorator';
import { RateLimitGuard } from '../infrastructure/guards/rate-limit.guard';
import { InMemoryRateLimitStore } from '../infrastructure/rate-limit/in-memory-rate-limit-store.service';

const get = (app: INestApplication, path: string) =>
  request(app.getHttpServer()).get(path);

@ApiTags('probe-e2e')
@Controller('probe')
class ProbeController {
  @Get('limited')
  @RateLimit({ limit: 2, windowMs: 60_000 })
  @ApiOkResponse({ description: 'ok' })
  limited() {
    return { ok: true };
  }

  @Get('unlimited')
  @ApiOkResponse({ description: 'ok' })
  unlimited() {
    return { ok: true };
  }
}

describe('rate limiting (e2e, issue #56) — in-memory reference store', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
      providers: [
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: RATE_LIMIT_STORE_TOKEN, useClass: InMemoryRateLimitStore },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // `listen`, not just `init`: supertest binds an ephemeral port per
    // request when the server is not already listening, and closes it
    // after. This file issues far more sequential requests than most,
    // and that bind/close churn intermittently delivers a response on a
    // reused port to the wrong client — surfacing as
    // `Parse Error: Expected HTTP/, RTSP/ or ICE/`. Listening once for
    // the whole suite removes the churn.
    await app.listen(0);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('allows requests up to the limit and reports remaining via headers', async () => {
    const first = await get(app, '/probe/limited').expect(200);
    expect(first.headers['x-ratelimit-limit']).toBe('2');
    expect(first.headers['x-ratelimit-remaining']).toBe('1');

    await get(app, '/probe/limited').expect(200);
  });

  it('rejects the request over the limit with 429 and Retry-After', async () => {
    const res = await get(app, '/probe/limited').expect(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('a route without @RateLimit() is never throttled', async () => {
    for (let i = 0; i < 10; i++) {
      await get(app, '/probe/unlimited').expect(200);
    }
  });
});

/* ------------------------------------------------------------------ *
 * Shared-backend reference store — the shape `CONFIGURATION.md` §7d
 * documents for a multi-instance deployment.
 * ------------------------------------------------------------------ */

/**
 * One row per *attempt*, not one mutable counter row per key.
 *
 * The obvious design — a `{ key, count }` row read, incremented and
 * written back — cannot be made correct through this repository
 * contract. `RepositoryInterface` has no atomic increment, `upsert()`
 * only conflicts on the primary key and overwrites with literal values,
 * and `findOne()` has no pessimistic-lock option, so a read-modify-write
 * either loses updates under concurrency or has to hold a transaction
 * per request (which, on a single-writer store, serialises the whole
 * limiter into the request path).
 *
 * Appending is the shape that IS expressible atomically: one INSERT per
 * attempt can never be lost, and the attempt's position inside the
 * window is recovered from its own generated id. No raw SQL and no
 * dialect-specific upsert (rule 13) — but it is not backend-neutral
 * either, and `CONFIGURATION.md` §7d says so: the rank depends on
 * generated ids being monotonic and comparable. True of a SQL identity
 * column, false of the Firestore adapter's `randomUUID()` keys, where a
 * counter document with that adapter's native `increment()` is the
 * right design instead.
 */
@Entity('rate_limit_events')
@Index(['key', 'at'])
class RateLimitEventEntity {
  @PrimaryGeneratedColumn() id!: number;
  @Column({ type: 'varchar' }) key!: string;
  @Column({ type: 'bigint' }) at!: number;
}

const RATE_LIMIT_EVENT_KEY = 'rateLimitEvent';

@Injectable()
class SqlRateLimitStore implements RateLimitStoreInterface {
  constructor(
    @InjectDynamicRepository(RATE_LIMIT_EVENT_KEY)
    private readonly events: RepositoryInterface<RateLimitEventEntity>,
  ) {}

  async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    // Guards run before interceptors, so there is no ambient request ctx
    // to join — this is the context this store creates and owns. It is
    // still forwarded to every repository call below: without it the
    // adapter runs the call hook-free (rule 16 / issue #45).
    const ctx = AppContextHost.from();

    const now = Date.now();
    // Fixed window on aligned buckets. Unlike `InMemoryRateLimitStore`
    // (whose window is anchored on the key's first request) this anchor
    // needs no extra read and is identical across instances, which is
    // the property a shared backend actually needs.
    const windowStart = Math.floor(now / windowMs) * windowMs;

    // Atomic: a single INSERT. Two concurrent attempts cannot collapse
    // into one count the way a read-modify-write can.
    const event = await this.events.create({ key, at: now }, { ctx });

    // This attempt's rank within the window. `id <= event.id` gives
    // each attempt its own rank instead of letting concurrent attempts
    // read one shared pre-increment value.
    //
    // How exact that rank is depends on the backend. On a serialized
    // writer (SQLite, which is what the concurrency test below proves)
    // every INSERT commits before the next begins, so N concurrent
    // attempts get N distinct ranks and exactly `limit` are admitted.
    // On pooled Postgres/MySQL a lower id may still be uncommitted when
    // this COUNT runs, so a burst can over-admit by the in-flight
    // concurrency. It never admits fewer and never loses an attempt.
    //
    // Cost is O(rows in the window), not constant — the ['key','at']
    // index changes the constant, not the order. See §7d.
    const count = await this.events.count({
      where: Where.and(
        Where.eq<RateLimitEventEntity>('key', key),
        Where.gte<RateLimitEventEntity>('at', windowStart),
        Where.lte<RateLimitEventEntity>('id', event.id),
      ),
      ctx,
    });

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      resetAt: windowStart + windowMs,
    };
  }
}

const REFILL_WINDOW_MS = 1_000;

@ApiTags('sql-probe-e2e')
@Controller('sql-probe')
class SqlProbeController {
  @Get('limited')
  @RateLimit({ limit: 2, windowMs: 3_600_000 })
  @ApiOkResponse({ description: 'ok' })
  limited() {
    return { ok: true };
  }

  @Get('concurrent')
  @RateLimit({ limit: 2, windowMs: 3_600_000 })
  @ApiOkResponse({ description: 'ok' })
  concurrent() {
    return { ok: true };
  }

  // Short window so the refill test can actually observe a bucket roll
  // over. The other routes use an hour precisely so they cannot.
  @Get('refill')
  @RateLimit({ limit: 1, windowMs: REFILL_WINDOW_MS })
  @ApiOkResponse({ description: 'ok' })
  refill() {
    return { ok: true };
  }
}

/**
 * Sleep until the next aligned bucket starts, so a test that needs two
 * requests in the SAME bucket gets a full window of headroom instead of
 * racing a boundary it happened to start next to.
 */
const waitForNextBucket = async (windowMs: number) => {
  const now = Date.now();
  const next = Math.floor(now / windowMs) * windowMs + windowMs;
  await new Promise((resolve) => setTimeout(resolve, next - now + 10));
};

// defineModuleResource, not a plain TypeOrmModule.forFeature + @Module —
// every repository primitive SqlRateLimitStore needs is registered by
// RocketsCoreModule's own composition, the same wiring a real app goes
// through (rule 2/4 in AGENTS.md).
const rateLimitEventResource = defineModuleResource({
  entities: [{ key: RATE_LIMIT_EVENT_KEY, entity: RateLimitEventEntity }],
  controllers: [SqlProbeController],
  providers: [SqlRateLimitStore],
  // Crosses the module boundary: the root test module's
  // `RATE_LIMIT_STORE_TOKEN` provider aliases it via `useExisting`.
  exports: [SqlRateLimitStore],
});

describe('rate limiting (e2e, issue #56) — shared-backend store on a real database', () => {
  let app: INestApplication;
  let events: RepositoryInterface<RateLimitEventEntity>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [RateLimitEventEntity],
          synchronize: true,
          dropSchema: true,
        }),
        RocketsCoreModule.forRoot({
          repository: TypeOrmRepositoryModule,
          resources: [rateLimitEventResource],
          global: true,
        }),
      ],
      providers: [
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: RATE_LIMIT_STORE_TOKEN, useExisting: SqlRateLimitStore },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // `listen`, not just `init`: supertest binds an ephemeral port per
    // request when the server is not already listening, and closes it
    // after. This file issues far more sequential requests than most,
    // and that bind/close churn intermittently delivers a response on a
    // reused port to the wrong client — surfacing as
    // `Parse Error: Expected HTTP/, RTSP/ or ICE/`. Listening once for
    // the whole suite removes the churn.
    await app.listen(0);

    events = app.get<RepositoryInterface<RateLimitEventEntity>>(
      getDynamicRepositoryToken(RATE_LIMIT_EVENT_KEY),
    );
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const rowsForRoute = async (route: string) => {
    const all = await events.find({});
    return all.filter((row) => row.key.endsWith(`:GET:${route}`));
  };

  it('enforces the limit against a real database', async () => {
    await get(app, '/sql-probe/limited').expect(200);
    await get(app, '/sql-probe/limited').expect(200);
    await get(app, '/sql-probe/limited').expect(429);

    // Every attempt is recorded, the rejected one included — a limiter
    // that only counts the requests it lets through cannot rate-limit.
    expect(await rowsForRoute('/sql-probe/limited')).toHaveLength(3);
  });

  it('loses no attempt under concurrency: 10 parallel requests, limit 2 (exact on a serialized writer)', async () => {
    // The regression this pins: the earlier read-modify-write store
    // returned 1x200 / 0x429 / 9x503 here (overlapping transactions
    // stomping each other's savepoints) and persisted a final count of
    // 1 — nine attempts vanished entirely rather than being rejected.
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => get(app, '/sql-probe/concurrent')),
    );

    const statuses = responses.map((res) => res.status);
    const countOf = (status: number) =>
      statuses.filter((value) => value === status).length;

    // No 503s: a 503 here means the store threw, which is the failure
    // shape the broken implementation produced.
    expect(countOf(503)).toBe(0);
    expect(countOf(200)).toBe(2);
    expect(countOf(429)).toBe(8);

    // Not one attempt lost.
    expect(await rowsForRoute('/sql-probe/concurrent')).toHaveLength(10);
  });

  it('refills the budget when the window rolls over', async () => {
    // Without this, a store that counted every attempt a key ever made
    // and banned it forever would satisfy every other test in the file:
    // nothing else here observes a window expiring. Deleting the
    // `at >= windowStart` term from the store must turn this red.
    await waitForNextBucket(REFILL_WINDOW_MS);

    await get(app, '/sql-probe/refill').expect(200);
    await get(app, '/sql-probe/refill').expect(429);

    // New bucket: the earlier attempts fall outside the window and the
    // budget comes back.
    await waitForNextBucket(REFILL_WINDOW_MS);

    await get(app, '/sql-probe/refill').expect(200);

    // The expired attempts are still on disk — they are simply no
    // longer counted. This is what makes pruning a deployment concern.
    expect(await rowsForRoute('/sql-probe/refill')).toHaveLength(3);
  }, 15_000);
});

/* ------------------------------------------------------------------ *
 * Rule 16 seam — what `ctx` on a repository call actually buys you.
 * ------------------------------------------------------------------ */

@Entity('ctx_probe_rows')
class CtxProbeEntity {
  @PrimaryColumn({ type: 'varchar' }) key!: string;
}

const CTX_PROBE_KEY = 'ctxProbeRow';

/**
 * A store whose only job is to make the `ctx` seam observable.
 *
 * It opens a `TransactionScope`, writes through the dynamic repository,
 * and then throws while still INSIDE the scope. `TransactionScope.run`
 * rolls back on a throw, so the write survives the request if and only
 * if it escaped the transaction — which is exactly what dropping `ctx`
 * from the repository call does (`TypeOrmRepository.getRepo` silently
 * falls back to the non-transactional repository when the ctx carries
 * no `TrxCtx` overlay). The guard turns the throw into a `503`, so the
 * HTTP status alone cannot tell the two apart; only the row count can.
 *
 * `forwardCtx` is flipped by the tests rather than fixed, so the suite
 * pins BOTH sides of the seam. Without the negative case the positive
 * assertion would be satisfied by an implementation that never opened a
 * transaction at all.
 */
@Injectable()
class CtxProbeRateLimitStore implements RateLimitStoreInterface {
  forwardCtx = true;

  constructor(
    @InjectDynamicRepository(CTX_PROBE_KEY)
    private readonly rows: RepositoryInterface<CtxProbeEntity>,
    private readonly txScope: TransactionScope,
  ) {}

  async consume(key: string): Promise<RateLimitResult> {
    const ctx = AppContextHost.from();
    return this.txScope.run(ctx, async (txCtx) => {
      await this.rows.create(
        { key },
        // The whole experiment: forwarded, this write joins the
        // scope's transaction; omitted, it autocommits beside it.
        this.forwardCtx ? { ctx: txCtx } : {},
      );
      throw new Error('probe: failing after the write, inside the scope');
    });
  }
}

@ApiTags('ctx-probe-e2e')
@Controller('ctx-probe')
class CtxProbeController {
  @Get('limited')
  @RateLimit({ limit: 2, windowMs: 3_600_000 })
  @ApiOkResponse({ description: 'ok' })
  limited() {
    return { ok: true };
  }
}

const ctxProbeResource = defineModuleResource({
  entities: [{ key: CTX_PROBE_KEY, entity: CtxProbeEntity }],
  controllers: [CtxProbeController],
  providers: [CtxProbeRateLimitStore],
  exports: [CtxProbeRateLimitStore],
});

describe('rate limiting (e2e, issue #56) — ctx forwarding is what puts a store write inside the transaction', () => {
  let app: INestApplication;
  let rows: RepositoryInterface<CtxProbeEntity>;
  let store: CtxProbeRateLimitStore;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [CtxProbeEntity],
          synchronize: true,
          dropSchema: true,
        }),
        RocketsCoreModule.forRoot({
          repository: TypeOrmRepositoryModule,
          resources: [ctxProbeResource],
          global: true,
        }),
      ],
      providers: [
        { provide: APP_GUARD, useClass: RateLimitGuard },
        {
          provide: RATE_LIMIT_STORE_TOKEN,
          useExisting: CtxProbeRateLimitStore,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // `listen`, not just `init`: supertest binds an ephemeral port per
    // request when the server is not already listening, and closes it
    // after. This file issues far more sequential requests than most,
    // and that bind/close churn intermittently delivers a response on a
    // reused port to the wrong client — surfacing as
    // `Parse Error: Expected HTTP/, RTSP/ or ICE/`. Listening once for
    // the whole suite removes the churn.
    await app.listen(0);

    rows = app.get<RepositoryInterface<CtxProbeEntity>>(
      getDynamicRepositoryToken(CTX_PROBE_KEY),
    );
    store = app.get(CtxProbeRateLimitStore);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // Reset the toggle per test rather than relying on `it` order, so
  // adding a case later cannot silently inherit the previous one's
  // setting.
  beforeEach(async () => {
    store.forwardCtx = true;
    const existing = await rows.find({});
    if (existing.length) await rows.deleteMany(existing);
  });

  it('with ctx forwarded, the failed store write is rolled back', async () => {
    await get(app, '/ctx-probe/limited').expect(503);

    // The write joined the scope's transaction, so the scope's rollback
    // took it with it.
    expect(await rows.find({})).toHaveLength(0);
  });

  it('with ctx omitted, the same failed write survives — the defect rule 16 names', async () => {
    // The control. This asserts the BROKEN behaviour on purpose: it is
    // what makes the assertion above discriminating rather than
    // tautological. If this ever starts rolling back too, the test
    // above has stopped proving anything.
    store.forwardCtx = false;

    await get(app, '/ctx-probe/limited').expect(503);

    expect(await rows.find({})).toHaveLength(1);
  });
});
