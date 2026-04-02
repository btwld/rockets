import { HttpStatus } from '@nestjs/common';
import {
  RuntimeException,
  RuntimeExceptionOptions,
} from '@concepta/nestjs-common';

export class UserMetadataException extends RuntimeException {
  constructor(message: string, options?: RuntimeExceptionOptions) {
    super({
      message,
      ...options,
    });
    this.errorCode = 'USER_METADATA_ERROR';
  }
}

export class UserMetadataNotFoundException extends UserMetadataException {
  constructor(options?: RuntimeExceptionOptions) {
    super('The user metadata was not found', {
      httpStatus: HttpStatus.NOT_FOUND,
      ...options,
    });
    this.errorCode = 'USER_METADATA_NOT_FOUND_ERROR';
  }
}

export class UserMetadataCannotBeDeletedException extends UserMetadataException {
  constructor(options?: RuntimeExceptionOptions) {
    super('Cannot delete user metadata because it has associated records', {
      httpStatus: HttpStatus.CONFLICT,
      ...options,
    });
    this.errorCode = 'USER_METADATA_CANNOT_BE_DELETED_ERROR';
  }
}

export class UserMetadataUnauthorizedAccessException extends UserMetadataException {
  constructor(options?: RuntimeExceptionOptions) {
    super('You are not authorized to access this user metadata', {
      httpStatus: HttpStatus.FORBIDDEN,
      ...options,
    });
    this.errorCode = 'USER_METADATA_UNAUTHORIZED_ACCESS_ERROR';
  }
}
