import { HttpStatus } from '@nestjs/common';
import {
  RuntimeException,
  RuntimeExceptionOptions,
} from '@concepta/nestjs-core';

export class UserException extends RuntimeException {
  constructor(message: string, options?: RuntimeExceptionOptions) {
    super({ message, ...options });
    this.errorCode = 'USER_ERROR';
  }
}

export class DuplicateUserException extends UserException {
  constructor(options?: RuntimeExceptionOptions) {
    super('User with this username or email already exists', {
      httpStatus: HttpStatus.BAD_REQUEST,
      ...options,
    });
    this.errorCode = 'USER_DUPLICATE_ERROR';
  }
}
