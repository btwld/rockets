import {
  ExceptionInterface,
  mapHttpStatus,
  RuntimeException,
} from '@bitwild/rockets-common';
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

  catch(exception: ExceptionInterface, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();

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

    if (exception.context?.validationErrors) {
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
}
