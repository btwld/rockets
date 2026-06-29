import { HttpStatus } from '@nestjs/common';
import {
  RuntimeException,
  RuntimeExceptionOptions,
} from '@concepta/nestjs-core';

export class PetException extends RuntimeException {
  constructor(message: string, options?: RuntimeExceptionOptions) {
    super({
      message,
      ...options,
    });
    this.errorCode = 'PET_ERROR';
  }
}

export class PetNotFoundException extends PetException {
  constructor(options?: RuntimeExceptionOptions) {
    super('The pet was not found', {
      httpStatus: HttpStatus.NOT_FOUND,
      ...options,
    });
    this.errorCode = 'PET_NOT_FOUND_ERROR';
  }
}

export class PetNameAlreadyExistsException extends PetException {
  constructor(options?: RuntimeExceptionOptions) {
    super('A pet with this name already exists', {
      httpStatus: HttpStatus.CONFLICT,
      ...options,
    });
    this.errorCode = 'PET_NAME_ALREADY_EXISTS_ERROR';
  }
}

export class PetCannotBeDeletedException extends PetException {
  constructor(options?: RuntimeExceptionOptions) {
    super('Cannot delete pet because it has associated records', {
      httpStatus: HttpStatus.CONFLICT,
      ...options,
    });
    this.errorCode = 'PET_CANNOT_BE_DELETED_ERROR';
  }
}

export class PetUnauthorizedAccessException extends PetException {
  constructor(options?: RuntimeExceptionOptions) {
    super('You are not authorized to access this pet', {
      httpStatus: HttpStatus.FORBIDDEN,
      ...options,
    });
    this.errorCode = 'PET_UNAUTHORIZED_ACCESS_ERROR';
  }
}
