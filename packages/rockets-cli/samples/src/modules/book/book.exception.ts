import { HttpStatus } from '@nestjs/common';
import { RuntimeException, RuntimeExceptionOptions } from '@concepta/nestjs-common';

export class BookException extends RuntimeException {
  constructor(options?: RuntimeExceptionOptions) {
    super(options);
    this.errorCode = 'BOOK_ERROR';
  }
}

export class BookNotFoundException extends BookException {
  constructor(options?: RuntimeExceptionOptions) {
    super({ message: 'Book not found', httpStatus: HttpStatus.NOT_FOUND, ...options });
    this.errorCode = 'BOOK_NOT_FOUND_ERROR';
  }
}

export class BookNameAlreadyExistsException extends BookException {
  constructor(options?: RuntimeExceptionOptions) {
    super({ message: 'Book name already exists', httpStatus: HttpStatus.CONFLICT, ...options });
    this.errorCode = 'BOOK_NAME_ALREADY_EXISTS_ERROR';
  }
}


