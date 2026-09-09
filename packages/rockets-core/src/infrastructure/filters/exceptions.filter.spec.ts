import { describe, it, expect, vi } from 'vitest';
import {
  type ArgumentsHost,
  ConflictException,
  type PlainLiteralObject,
} from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { RuntimeException } from '@concepta/nestjs-core';
import { RepositoryQueryException } from '@concepta/nestjs-repository';
import {
  RocketsCoreExceptionsFilter,
  unwrapToHttpException,
} from './exceptions.filter';

/**
 * Upstream alpha.9 made `RuntimeException` extend `HttpException`. The
 * filter's unwrap walk and its status/errorCode branches were written when
 * the two were unrelated, so the wrapper chain the repository membrane
 * builds (`RepositoryQueryException(500)` → the hook's `ConflictException`)
 * matched `instanceof HttpException` at the OUTERMOST node and the client
 * got a 500 for every hook-raised 4xx. These tests pin the chain walk and
 * the envelope against the real upstream classes.
 */
describe('RocketsCoreExceptionsFilter', () => {
  interface Reply {
    readonly body: PlainLiteralObject;
    readonly status: number;
  }

  function run(exception: unknown): Reply {
    const reply =
      vi.fn<(res: unknown, body: PlainLiteralObject, status: number) => void>();
    // Controlled mock shapes: the filter reads exactly `httpAdapter.reply`
    // and `switchToHttp().getRequest()/getResponse()`.
    const adapterHost = {
      httpAdapter: { reply },
    } as unknown as HttpAdapterHost;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {}, params: {}, query: {} }),
        getResponse: () => ({}),
      }),
    } as unknown as ArgumentsHost;

    new RocketsCoreExceptionsFilter(adapterHost).catch(
      exception as Parameters<RocketsCoreExceptionsFilter['catch']>[0],
      host,
    );

    const call = reply.mock.calls[0];
    if (!call) throw new Error('filter did not reply');
    return { body: call[1], status: call[2] };
  }

  const wrap = (inner: unknown): RepositoryQueryException =>
    new RepositoryQueryException('note', { originalError: inner });

  it('unwrapToHttpException walks THROUGH the RuntimeException wrappers to the hook exception', () => {
    const conflict = new ConflictException('ref "dup" is already in use');
    const chain = wrap(wrap(conflict));

    expect(unwrapToHttpException(chain)).toBe(conflict);
  });

  it('a hook ConflictException wrapped by the repository membrane stays a 409', () => {
    const { status, body } = run(
      wrap(new ConflictException('ref "dup" is already in use')),
    );

    expect(status).toBe(409);
    expect(body.statusCode).toBe(409);
    expect(body.message).toBe('ref "dup" is already in use');
  });

  it('a wrapped 4xx RuntimeException carrier keeps its own errorCode', () => {
    class DomainConflictException extends RuntimeException {
      constructor() {
        super({ message: 'slug taken', httpStatus: 409 });
        this.errorCode = 'DOMAIN_SLUG_TAKEN';
      }
    }
    const { status, body } = run(wrap(new DomainConflictException()));

    expect(status).toBe(409);
    expect(body.errorCode).toBe('DOMAIN_SLUG_TAKEN');
    expect(body.message).toBe('slug taken');
  });

  it('a raw 4xx RuntimeException is answered at its httpStatus with its errorCode', () => {
    const runtime = new RuntimeException({
      message: 'internal wording',
      safeMessage: 'client wording',
      httpStatus: 400,
    });
    runtime.errorCode = 'DOMAIN_INVALID';

    const { status, body } = run(runtime);

    expect(status).toBe(400);
    expect(body.errorCode).toBe('DOMAIN_INVALID');
    expect(body.message).toBe('client wording');
  });

  it('a wrapper chain with no client exception inside stays a masked 500', () => {
    const { status, body } = run(wrap(new Error('dsn=secret://x')));

    expect(status).toBe(500);
    expect(body.message).toBe('Internal Server Error');
    expect(JSON.stringify(body)).not.toContain('secret://');
  });
});
