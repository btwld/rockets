import {
  ExceptionInterface,
  mapHttpStatus,
  RuntimeException,
} from '@bitwild/rockets-app';
import {
  Catch,
  ArgumentsHost,
  ExceptionFilter,
  HttpException,
  ValidationPipe,
} from '@nestjs/common';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { HttpAdapterHost } from '@nestjs/core';

export const ERROR_MESSAGE_FALLBACK = 'Internal Server Error';

@Catch()
export class RocketsCoreExceptionsFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(rawException: ExceptionInterface, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

    // Unwrap nested `context.originalError` chains. Repository / CRUD
    // adapters wrap underlying errors as `ModelQueryException` →
    // `CrudQueryException`. When the deepest cause is an `HttpException`
    // (raised by a hook or deeper layer to express an authorization or
    // validation failure), surface that exception directly so the client
    // sees the intended status (401/403/400) instead of an opaque 500.
    //
    // NOTE: in upstream `@concepta/nestjs-common@8.0.0-alpha.4`, the
    // descendants of `RuntimeException` lose `context.originalError`
    // when their constructors do `Object.assign({}, super.context, …)`
    // (`super.context` resolves on the prototype, not on `this`). For
    // pre-handler validation that must surface as 4xx, prefer a NestJS
    // Guard or Pipe over a `Before*` repo hook so the `HttpException`
    // never enters the wrapping pipeline in the first place.
    const unwrapped = this.unwrapToHttpException(rawException);
    const exception: ExceptionInterface | HttpException =
      unwrapped ?? rawException;

    let errorCode = 'ERROR_CODE_UNKNOWN';
    let statusCode = 500;
    let message: unknown = ERROR_MESSAGE_FALLBACK;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      errorCode = mapHttpStatus(statusCode);

      const res = exception.getResponse();
      message = isObject(res) && 'message' in res ? res.message : res;
    } else if (exception instanceof RuntimeException) {
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
    }

    if (
      !(exception instanceof HttpException) &&
      exception.context?.validationErrors
    ) {
      const nestValidationPipe = new ValidationPipe();
      message = nestValidationPipe['flattenValidationErrors'](
        exception.context.validationErrors as [],
      );
      statusCode = 400;
    }

    if (statusCode >= 500 && process.env.NODE_ENV !== 'production') {
      const e = exception as {
        stack?: string;
        context?: { originalError?: unknown };
      };
      // eslint-disable-next-line no-console
      console.error('[RocketsCoreExceptionsFilter] 5xx:', e.stack ?? exception);
      const orig = e.context?.originalError;
      if (orig) {
        // eslint-disable-next-line no-console
        console.error(
          '[RocketsCoreExceptionsFilter] originalError:',
          (orig as { stack?: string }).stack ?? orig,
        );
      }
    }

    const responseBody = {
      statusCode,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }

  /**
   * Walk the `context.originalError` chain of nested wrapped exceptions
   * and return the first `HttpException` encountered. Returns `undefined`
   * if the chain contains no `HttpException` (the original exception
   * already represents the right shape).
   */
  private unwrapToHttpException(exception: unknown): HttpException | undefined {
    let current: unknown = exception;
    const seen = new Set<unknown>();
    while (current && !seen.has(current)) {
      seen.add(current);
      if (current instanceof HttpException) {
        return current === exception ? undefined : current;
      }
      const next = (current as { context?: { originalError?: unknown } })
        ?.context?.originalError;
      if (!next || next === current) break;
      current = next;
    }
    return undefined;
  }
}
