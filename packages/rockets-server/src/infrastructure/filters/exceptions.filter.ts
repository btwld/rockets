import {
  ExceptionInterface,
  mapHttpStatus,
  RuntimeException,
} from '@concepta/nestjs-common';
import {
  Catch,
  ArgumentsHost,
  HttpException,
  ValidationPipe,
} from '@nestjs/common';
import { isObject } from '@nestjs/common/utils/shared.utils';
import { HttpAdapterHost } from '@nestjs/core';

export const ERROR_MESSAGE_FALLBACK = 'Internal Server Error';

// TODO: use the exception filter from concepta modules need to update rockets to add validation errors
@Catch()
export class ExceptionsFilter implements ExceptionsFilter {
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

    const responseBody = {
      statusCode,
      errorCode,
      message,
      timestamp: new Date().toISOString(),
    };

    httpAdapter.reply(ctx.getResponse(), responseBody, statusCode);
  }
}
