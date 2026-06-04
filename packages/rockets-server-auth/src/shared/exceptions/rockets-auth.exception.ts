import { HttpStatus } from '@nestjs/common';
import {
  RuntimeException,
  RuntimeExceptionOptions,
} from '@bitwild/rockets-app';

export class RocketsAuthException extends RuntimeException {
  constructor(message: string, options?: RuntimeExceptionOptions) {
    super({
      message,
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_ERROR';
  }
}
