import { HttpStatus } from '@nestjs/common';
import { RuntimeException, RuntimeExceptionOptions } from '@concepta/nestjs-common';

export class NoteException extends RuntimeException {
  constructor(options?: RuntimeExceptionOptions) {
    super(options);
    this.errorCode = 'NOTE_ERROR';
  }
}

export class NoteNotFoundException extends NoteException {
  constructor(options?: RuntimeExceptionOptions) {
    super({ message: 'Note not found', httpStatus: HttpStatus.NOT_FOUND, ...options });
    this.errorCode = 'NOTE_NOT_FOUND_ERROR';
  }
}

export class NoteNameAlreadyExistsException extends NoteException {
  constructor(options?: RuntimeExceptionOptions) {
    super({ message: 'Note name already exists', httpStatus: HttpStatus.CONFLICT, ...options });
    this.errorCode = 'NOTE_NAME_ALREADY_EXISTS_ERROR';
  }
}


