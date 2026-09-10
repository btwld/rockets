import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  INestApplication,
  NestInterceptor,
  Scope,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Test } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { z } from 'zod';
import request from 'supertest';

import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
} from '../domain/interfaces/auth-adapter.interface';
import { extractBearerToken } from '../infrastructure/auth/extract-bearer-token';
import { RocketsCoreModule } from '../rockets-core.module';
import { AuthServerGuard } from '../infrastructure/guards/auth-server.guard';
import { defineAuthAdapter } from '../infrastructure/auth/define-auth-adapter';
import { operationResource } from '../zod/zod-operation-resource';

@Injectable()
class SimpleAuthProvider implements AuthAdapterInterface {
  async authenticate(req: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(req);
    if (token === null) return { matched: false };
    if (token === 'ok') return { matched: true, user: { id: 'u1', sub: 'u1' } };
    return { matched: true, error: new UnauthorizedException() };
  }
}

/**
 * Set by handlers so a test can observe server-side effects that never
 * reach an HTTP response — the deadline / disconnect cases by definition
 * don't (either the client already gave up, or the response is 504).
 */
const observed: {
  cooperativeAborted: boolean;
  disconnectSignalAborted: boolean;
  handlerFinishedAt: number | undefined;
  routeSettledAt: number | undefined;
} = {
  cooperativeAborted: false,
  disconnectSignalAborted: false,
  handlerFinishedAt: undefined,
  routeSettledAt: undefined,
};

/**
 * Records when the ROUTE settles, as opposed to when the handler
 * finishes. `Transactional()`'s interceptor settles the transaction on
 * exactly this signal, so "the route settled before the handler
 * finished" IS "the transaction was committed or rolled back under a
 * handler that is still writing".
 */
@Injectable()
class SettleProbeInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const mark = (): void => {
      observed.routeSettledAt ??= Date.now();
    };
    return next.handle().pipe(tap({ next: mark, error: mark, complete: mark }));
  }
}

const SLOW_DEP = 'SLOW_DEP';

@Injectable()
class SlowDiHandler {
  constructor(@Inject(SLOW_DEP) private readonly dep: string) {}

  handle(): { ok: boolean } {
    return { ok: this.dep === 'slow' };
  }
}

/**
 * Same slow request-scoped dependency as {@link SlowDiHandler}, but the
 * handler REJECTS shortly after it finally resolves — i.e. after the
 * deadline has already fired and `race()` has already returned. Nothing
 * is awaiting that promise at that point, so without an explicit
 * observer it is an unhandled rejection, which under Node's default
 * `--unhandled-rejections=throw` takes the process down on one slow
 * request. `SlowDiHandler` cannot catch this: it returns a plain object.
 */
@Injectable()
class SlowDiRejectingHandler {
  constructor(@Inject(SLOW_DEP) private readonly dep: string) {}

  handle(): Promise<{ ok: boolean }> {
    return new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error(`boom-from-handler(${this.dep})`)), 20);
    });
  }
}

const deadlineOps = operationResource({
  path: 'deadline-ops',
  public: true,
  operations: (op) => ({
    // Ignores ctx.signal entirely — proves the CLIENT still gets 504 even
    // when the handler is not cooperative.
    slowIgnoresSignal: op.read({
      path: 'slow-ignores-signal',
      deadlineMs: 30,
      output: z.object({ ok: z.boolean() }),
      handler: () =>
        new Promise<{ ok: boolean }>((resolve) =>
          setTimeout(() => resolve({ ok: true }), 500),
        ),
    }),
    // A generous deadline that never fires — the control case proving
    // deadlineMs doesn't wrongly reject an operation that finishes in time.
    fastWithGenerousDeadline: op.read({
      path: 'fast-with-generous-deadline',
      deadlineMs: 5000,
      output: z.object({ ok: z.boolean() }),
      handler: () => ({ ok: true }),
    }),
    // Races its own work against ctx.signal — proves a cooperative
    // handler can observe the SAME abort that produces the client's 504.
    slowRacesSignal: op.read({
      path: 'slow-races-signal',
      deadlineMs: 30,
      output: z.object({ ok: z.boolean() }),
      handler: (ctx) =>
        new Promise<{ ok: boolean }>((resolve, reject) => {
          const timer = setTimeout(() => resolve({ ok: true }), 500);
          ctx.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            observed.cooperativeAborted = true;
            reject(ctx.signal.reason);
          });
        }),
    }),
    // No deadline — a client disconnect is the only thing that can abort
    // this one. The handler waits long enough for the test to destroy the
    // socket, then reports whether it saw the abort.
    disconnectAware: op.read({
      path: 'disconnect-aware',
      output: z.object({ ok: z.boolean() }),
      handler: (ctx) =>
        new Promise<{ ok: boolean }>((resolve) => {
          ctx.signal.addEventListener('abort', () => {
            observed.disconnectSignalAborted = true;
          });
          setTimeout(() => resolve({ ok: true }), 300);
        }),
    }),
    // Class handler with a slow request-scoped dependency, so
    // `moduleRef.resolve()` genuinely spans real time — the exact window
    // between guard creation and `deadline.race(...)` where the abort
    // promise can settle before anything has attached a handler to it.
    slowDiDeadline: op.read({
      path: 'slow-di-deadline',
      deadlineMs: 10,
      output: z.object({ ok: z.boolean() }),
      handler: SlowDiHandler,
    }),
    slowDiDisconnect: op.read({
      path: 'slow-di-disconnect',
      output: z.object({ ok: z.boolean() }),
      handler: SlowDiHandler,
    }),
    // The deadline fires while DI is still resolving, so `race()` returns
    // the abort and nothing awaits the handler's promise — which then
    // rejects.
    slowDiRejects: op.read({
      path: 'slow-di-rejects',
      deadlineMs: 10,
      output: z.object({ ok: z.boolean() }),
      handler: SlowDiRejectingHandler,
    }),
    // A slow POST that carries a body: `close` on a request WITH a body
    // must not be mistaken for a disconnect (the socket stays open), so
    // this proves the real payload still comes back.
    slowEcho: op.write({
      path: 'slow-echo',
      input: z.object({ text: z.string() }),
      output: z.object({ text: z.string() }),
      handler: (ctx) =>
        new Promise<{ text: string }>((resolve) => {
          setTimeout(() => resolve({ text: ctx.input.text }), 120);
        }),
    }),
    // `transactional: true` with NO deadline (the two are rejected
    // together at definition time). A client disconnect must not settle
    // the response, because `Transactional()`'s interceptor would settle
    // the transaction underneath a handler that is still writing.
    // GET on purpose: `close` on a request that carried a body behaves
    // differently across adapters, and the seam under test here is the
    // transaction, not the transport.
    transactionalDisconnect: op.read({
      path: 'transactional-disconnect',
      transactional: true,
      decorators: [UseInterceptors(SettleProbeInterceptor)],
      output: z.object({ ok: z.boolean() }),
      handler: (ctx) =>
        new Promise<{ ok: boolean }>((resolve) => {
          ctx.signal.addEventListener('abort', () => {
            observed.disconnectSignalAborted = true;
          });
          setTimeout(() => {
            observed.handlerFinishedAt = Date.now();
            resolve({ ok: true });
          }, 200);
        }),
    }),
  }),
  providers: [
    SlowDiHandler,
    SlowDiRejectingHandler,
    SettleProbeInterceptor,
    {
      provide: SLOW_DEP,
      scope: Scope.REQUEST,
      useFactory: async () => {
        // Real elapsed time, deliberately longer than slowDiDeadline's
        // 10ms — this is what makes `moduleRef.resolve()` in
        // `routeHandler` span the window between guard creation and
        // `deadline.race(...)` for real, not just in theory.
        await new Promise((resolve) => setTimeout(resolve, 60));
        return 'slow';
      },
    },
  ],
});

describe('operationResource deadline / disconnect signal (e2e, issue #78)', () => {
  let app: INestApplication;
  let baseUrl: string;

  // `createDeadlineGuard`'s abort promise can settle before `race()` is
  // ever called — while `routeHandler` is still awaiting a slow
  // `moduleRef.resolve()`. Left unhandled, that crashes the WHOLE
  // process on Node's default `--unhandled-rejections=throw`, not just
  // the one request. A vitest assertion failure would not show that;
  // only capturing the process-level event does.
  const unhandledRejections: unknown[] = [];
  const onUnhandledRejection = (reason: unknown): void => {
    unhandledRejections.push(reason);
  };

  beforeAll(async () => {
    process.on('unhandledRejection', onUnhandledRejection);
    const moduleRef = await Test.createTestingModule({
      imports: [
        RocketsCoreModule.forRoot({
          auth: defineAuthAdapter(SimpleAuthProvider),
          providers: [SimpleAuthProvider],
          resources: [deadlineOps],
          global: true,
        }),
      ],
      providers: [{ provide: APP_GUARD, useClass: AuthServerGuard }],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    const server = await app.listen(0);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a network address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    process.off('unhandledRejection', onUnhandledRejection);
    if (app) await app.close();
  });

  afterEach(() => {
    expect(unhandledRejections).toEqual([]);
  });

  it('resolves 504 when the handler outruns deadlineMs, ignoring the signal', async () => {
    const res = await request(app.getHttpServer())
      .get('/deadline-ops/slow-ignores-signal')
      .expect(504);

    expect(res.body.statusCode).toBe(504);
  });

  it('does not trip a generous deadline on a fast handler', async () => {
    const res = await request(app.getHttpServer())
      .get('/deadline-ops/fast-with-generous-deadline')
      .expect(200);

    expect(res.body).toEqual({ ok: true });
  });

  it('exposes ctx.signal so a cooperative handler observes the same abort', async () => {
    observed.cooperativeAborted = false;

    const res = await request(app.getHttpServer())
      .get('/deadline-ops/slow-races-signal')
      .expect(504);

    expect(res.body.statusCode).toBe(504);
    expect(observed.cooperativeAborted).toBe(true);
  });

  it('aborts ctx.signal on a client disconnect, with no deadline set', async () => {
    observed.disconnectSignalAborted = false;

    await new Promise<void>((resolve, reject) => {
      const req = http.get(`${baseUrl}/deadline-ops/disconnect-aware`, () => {
        // A response arriving means the disconnect never actually
        // happened before the handler resolved — the test's premise
        // failed, not the feature.
        reject(new Error('expected the connection to be destroyed first'));
      });
      req.on('error', () => {
        // Destroying our own request raises ECONNRESET locally — expected.
        resolve();
      });
      setTimeout(() => req.destroy(), 20);
    });

    // The server-side effect is the only observable outcome here — the
    // client already gave up, so there is no response to assert on.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(observed.disconnectSignalAborted).toBe(true);
  });

  it("resolves 504 (not a crash, not a silent 200) when a class handler's slow DI resolution outruns the deadline", async () => {
    const res = await request(app.getHttpServer())
      .get('/deadline-ops/slow-di-deadline')
      .expect(504);

    expect(res.body.statusCode).toBe(504);
  });

  it('does not crash the process when the client disconnects while a class handler is still resolving its dependencies', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = http.get(`${baseUrl}/deadline-ops/slow-di-disconnect`, () => {
        reject(new Error('expected the connection to be destroyed first'));
      });
      req.on('error', () => resolve());
      // 5ms: well inside the 60ms slow-DI window, well before
      // `moduleRef.resolve()` returns and `deadline.race(...)` is
      // reached — the exact window the crash lived in.
      setTimeout(() => req.destroy(), 5);
    });

    // Give the in-flight DI resolution (and the app) time to actually
    // finish so a would-be unhandled rejection has a chance to surface
    // before this test (and the afterEach assertion) ends.
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  it('does not leave an unhandled rejection when a class handler rejects after its deadline already fired', async () => {
    const res = await request(app.getHttpServer())
      .get('/deadline-ops/slow-di-rejects')
      .expect(504);

    expect(res.body.statusCode).toBe(504);

    // The handler rejects ~20ms after DI finally resolves at ~60ms, i.e.
    // long after the 10ms deadline returned the 504 above. Nothing is
    // awaiting it by then; without an explicit observer this is the
    // process-killing unhandled rejection. `afterEach` is the assertion.
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(unhandledRejections).toEqual([]);
  });

  it('keeps the 504 body free of the controller name and the configured budget', async () => {
    const res = await request(app.getHttpServer())
      .get('/deadline-ops/slow-ignores-signal')
      .expect(504);

    const body = JSON.stringify(res.body);
    expect(res.body.message).toBe('Request exceeded its deadline');
    // A `public: true` operation answers anonymous callers, and the
    // filter passes an author-chosen 5xx body through unmasked — so the
    // body core authors must not name internals.
    expect(body).not.toContain('deadline-ops');
    expect(body).not.toContain('OperationResource_');
    expect(body).not.toContain('30ms');
  });

  it('returns the real payload of a slow POST that carries a body', async () => {
    const res = await request(app.getHttpServer())
      .post('/deadline-ops/slow-echo')
      .send({ text: 'hello' })
      .expect(200);

    // Guards the opposite direction of the disconnect handling: a request
    // WITH a body must never be read as a client that went away.
    expect(res.body).toEqual({ text: 'hello' });
  });

  it('runs a transactional operation to completion when the client disconnects', async () => {
    observed.disconnectSignalAborted = false;
    observed.handlerFinishedAt = undefined;
    observed.routeSettledAt = undefined;

    await new Promise<void>((resolve, reject) => {
      const req = http.get(
        `${baseUrl}/deadline-ops/transactional-disconnect`,
        () =>
          reject(new Error('expected the connection to be destroyed first')),
      );
      req.on('error', () => resolve());
      setTimeout(() => req.destroy(), 30);
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    // The signal still fires, so a cooperative handler can stop early…
    expect(observed.disconnectSignalAborted).toBe(true);
    // …but the route must NOT settle before the handler finishes.
    // `Transactional()`'s interceptor settles the transaction on exactly
    // that signal: settling early commits half a unit of work (or rolls
    // it back) while the handler is still writing, and strips the
    // TrxCtx overlay from everything it does afterwards.
    expect(observed.handlerFinishedAt).toBeTypeOf('number');
    expect(observed.routeSettledAt).toBeTypeOf('number');
    expect(observed.routeSettledAt ?? 0).toBeGreaterThanOrEqual(
      observed.handlerFinishedAt ?? 0,
    );
  });
});
