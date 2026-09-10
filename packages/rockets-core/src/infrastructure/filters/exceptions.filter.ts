import { PlainLiteralObject } from '@nestjs/common';
import { inspect } from 'node:util';
import { ExceptionInterface, RuntimeException } from '@concepta/nestjs-core';
import { mapHttpStatus } from './map-http-status.util';
import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { HttpAdapterHost } from '@nestjs/core';
import type { OperationRequest } from '../../domain/interfaces/operation-resource.interface';
import { readErrorDetails } from '../../common/utils/validation-error-details.util';
import {
  type RocketsErrorContext,
  type RocketsErrorDetail,
  defaultErrorSerializer,
  ROCKETS_ERROR_SERIALIZER_TOKEN,
  type RocketsErrorSerializerInterface,
} from './error-serializer';

export const ERROR_MESSAGE_FALLBACK = 'Internal Server Error';

/**
 * Walk the `context.originalError` chain and return the first
 * `HttpException` encountered, or `undefined` when the chain holds none
 * (or when the only one IS the exception passed in — the caller already
 * has it).
 *
 * Module-level so the SSE streaming path can run the SAME unwrap: an
 * error raised inside an `op.sse()` Observable never reaches this
 * filter once the response headers are committed, and re-deriving the
 * chain walk there would be a second implementation free to drift from
 * this one. {@link RocketsCoreExceptionsFilter.unwrapToHttpException}
 * delegates here so subclasses can still override the seam.
 */
export function unwrapToHttpException(
  exception: unknown,
): HttpException | undefined {
  let current: unknown = exception;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    // `RuntimeException` extends `HttpException` upstream, but in this
    // chain it is the WRAPPER (`CrudQueryException` → `RepositoryQueryException`
    // → the hook's `ConflictException`). Matching it here would stop the
    // walk at the outermost 500 and never reach the 409 it carries; the
    // 4xx domain carriers are the sibling walk's job.
    if (
      current instanceof HttpException &&
      !(current instanceof RuntimeException)
    ) {
      return current === exception ? undefined : current;
    }
    const next = (current as { context?: { originalError?: unknown } })?.context
      ?.originalError;
    if (!next || next === current) break;
    current = next;
  }
  return undefined;
}

/**
 * Walk the chain for the innermost `RuntimeException` carrying a 4xx
 * `httpStatus`. Shared with the SSE path for the same reason as
 * {@link unwrapToHttpException}.
 */
export function unwrapToClientRuntimeException(
  exception: unknown,
): RuntimeException | undefined {
  let current: unknown = exception;
  let candidate: RuntimeException | undefined;
  const seen = new Set<unknown>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (
      current instanceof RuntimeException &&
      current.httpStatus !== undefined &&
      current.httpStatus < 500 &&
      current !== exception
    ) {
      candidate = current;
    }
    const next = (current as { context?: { originalError?: unknown } })?.context
      ?.originalError;
    if (!next || next === current) break;
    current = next;
  }
  return candidate;
}

/**
 * Global exception filter: unwraps the repository/CRUD wrapping chain so
 * a hook's `409` stays a `409`, maps domain exceptions to their HTTP
 * status, and writes the response body.
 *
 * The body SHAPE is pluggable — pass a
 * {@link RocketsErrorSerializerInterface} as the second constructor
 * argument, or provide {@link ROCKETS_ERROR_SERIALIZER_TOKEN} when the
 * filter is registered through Nest. Status resolution and the unwrap
 * chain are deliberately not pluggable: forking the whole filter to
 * change three keys is what used to cost apps that behaviour.
 */
@Catch()
export class RocketsCoreExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(RocketsCoreExceptionsFilter.name);
  private readonly serializer: RocketsErrorSerializerInterface;

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    @Optional()
    @Inject(ROCKETS_ERROR_SERIALIZER_TOKEN)
    serializer?: RocketsErrorSerializerInterface,
  ) {
    this.serializer = serializer ?? defaultErrorSerializer;
  }

  catch(rawException: ExceptionInterface, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request: unknown = ctx.getRequest();

    // Unwrap nested `context.originalError` chains. Repository / CRUD
    // adapters wrap underlying errors as `ModelQueryException` →
    // `CrudQueryException`. When the deepest cause is an `HttpException`
    // (raised by a hook or deeper layer to express an authorization or
    // validation failure), surface that exception directly so the client
    // sees the intended status (401/403/400) instead of an opaque 500.
    // Guards and pipes run before that wrapping, so pre-handler validation
    // reaches here as its own 4xx already.
    const unwrapped =
      this.unwrapToHttpException(rawException) ??
      this.unwrapToClientRuntimeException(rawException);
    const exception: ExceptionInterface | HttpException =
      unwrapped ?? rawException;

    let errorCode = 'ERROR_CODE_UNKNOWN';
    let statusCode = 500;
    let message: unknown = ERROR_MESSAGE_FALLBACK;
    // Read for EVERY exception type, not only HttpException: a hook is
    // free to throw a `RuntimeException` carrying its own httpStatus and
    // details, which this filter would otherwise silently drop. Unwrapped
    // first, raw second, so a wrapped hook 400 keeps its findings.
    let details: readonly RocketsErrorDetail[] | undefined =
      readErrorDetails(exception) ?? readErrorDetails(rawException);

    // `RuntimeException` is checked FIRST: it extends `HttpException`
    // upstream, and the generic branch would replace a domain `errorCode`
    // with the status-derived one.
    if (exception instanceof RuntimeException) {
      errorCode = exception.errorCode;

      if (exception.httpStatus) {
        statusCode = exception.httpStatus;
      }

      if (statusCode >= 500) {
        message = exception.safeMessage ?? ERROR_MESSAGE_FALLBACK;
      } else if (exception.safeMessage) {
        message = exception.safeMessage;
      } else {
        message =
          exception.message ?? exception.safeMessage ?? ERROR_MESSAGE_FALLBACK;
      }
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      errorCode = mapHttpStatus(statusCode);

      const res = exception.getResponse();
      message = isObject(res) && 'message' in res ? res.message : res;
    }

    // Logged through Nest's Logger, not `console`, and at every 5xx —
    // whether the trace is printed is the consuming app's decision
    // (log levels, custom logger, transports), not this library's, and
    // it is certainly not `NODE_ENV`'s: that variable is unset in plenty
    // of production containers, which is exactly when the old
    // `!== 'production'` check leaked stack traces to stdout.
    if (statusCode >= 500) {
      const e = exception as {
        stack?: string;
        context?: { originalError?: unknown };
      };
      // `inspect` over String(): a stack-less non-Error exception would
      // otherwise log as the useless '[object Object]'.
      this.logger.error('Unhandled 5xx', e.stack ?? inspect(exception));
      const orig = e.context?.originalError;
      if (orig) {
        this.logger.error(
          'Unhandled 5xx originalError',
          (orig as { stack?: string }).stack ?? inspect(orig),
        );
      }
    }

    // Same invariant as the message masking above: a 5xx is an internal
    // failure and its content is not client-safe. `details` is a sibling
    // channel of `message` and obeys the same rule — an attached finding
    // that quotes an internal error must not ride around the mask.
    if (statusCode >= 500) {
      details = undefined;
    }

    const context: RocketsErrorContext = {
      statusCode,
      errorCode,
      message,
      originalException: rawException,
      ...(details && details.length > 0 ? { details } : {}),
      request: toErrorRequest(request),
    };
    // A serializer that THROWS is caught, not propagated: an unhandled
    // exception inside the exception filter replaces the resolved
    // status and envelope with the adapter's bare 500 — a serializer
    // bug silently rewriting every error response, routine 404s
    // included. Same rationale as the null-return fallback below.
    let serialized: PlainLiteralObject | null;
    try {
      serialized = this.serializer.serialize(context);
    } catch (serializerError) {
      this.logger.error(
        'Error serializer threw; falling back to the default envelope',
        serializerError instanceof Error
          ? serializerError.stack
          : inspect(serializerError),
      );
      serialized = null;
    }
    // A serializer that returns nothing would otherwise send an empty
    // body with a correct status — a client sees a 409 it cannot read.
    // Fall back rather than fail a second time inside the error path.
    const responseBody =
      serialized === null || serialized === undefined
        ? defaultErrorSerializer.serialize(context)
        : serialized;

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }

  /**
   * Walk the `context.originalError` chain of nested wrapped exceptions
   * and return the first `HttpException` encountered. Returns `undefined`
   * if the chain contains no `HttpException` (the original exception
   * already represents the right shape).
   *
   * A hook — functional or class-based — throws its own domain exception.
   * The upstream membrane wraps it in `RepositoryQueryException` with the
   * original on `context.originalError`, which is what this walk follows.
   * A hook that prefers to carry its own status may still throw a
   * `RuntimeException` with an `httpStatus`; those surface via
   * `unwrapToRuntimeException` below.
   */
  protected unwrapToHttpException(
    exception: unknown,
  ): HttpException | undefined {
    return unwrapToHttpException(exception);
  }

  /**
   * Walk the exception chain to find the innermost `RuntimeException` with
   * a 4xx `httpStatus`. This surfaces a hook that carries its own status
   * on a `RuntimeException` rather than throwing an `HttpException`.
   * Returns `undefined` if no 4xx `RuntimeException` is found.
   */
  protected unwrapToClientRuntimeException(
    exception: unknown,
  ): RuntimeException | undefined {
    return unwrapToClientRuntimeException(exception);
  }
}

/**
 * The request in the same transport-agnostic shape operation handlers
 * receive: typed `headers`/`params`/`query`, `raw` as the escape hatch.
 * Built defensively — the filter also fires for errors thrown before
 * routing, where params/query may not exist yet.
 */
function toErrorRequest(request: unknown): OperationRequest {
  const source: object = isObject(request) ? request : {};
  return {
    headers: recordOrEmpty(
      Reflect.get(source, 'headers'),
    ) as OperationRequest['headers'],
    params: recordOrEmpty(
      Reflect.get(source, 'params'),
    ) as OperationRequest['params'],
    query: recordOrEmpty(
      Reflect.get(source, 'query'),
    ) as OperationRequest['query'],
    raw: request,
  };
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  // `isObject` narrows only to `object`. The wider invariant the
  // callers' casts assert: on every supported adapter these maps carry
  // string keys with string / string[] values (headers, params) or
  // parsed primitives (query) — Express and Fastify both guarantee it.
  // TypeScript cannot check value types through `unknown`, so the
  // guarantee is the adapters' contract, restated here on purpose.
  return isObject(value) ? (value as Record<string, unknown>) : {};
}
