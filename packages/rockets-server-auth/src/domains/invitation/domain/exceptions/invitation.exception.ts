import { HttpStatus } from '@nestjs/common';
import { RuntimeExceptionOptions } from '@bitwild/rockets-app';
import { RocketsAuthException } from '../../../../shared/exceptions/rockets-auth.exception';

export class RocketsAuthInvitationException extends RocketsAuthException {
  constructor(message: string, options?: RuntimeExceptionOptions) {
    super(message, options);
    this.errorCode = 'ROCKETS_AUTH_INVITATION_ERROR';
  }
}

export class RocketsAuthInvitationNotFoundException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('The invitation was not found', {
      httpStatus: HttpStatus.NOT_FOUND,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_NOT_FOUND_ERROR';
  }
}

export class RocketsAuthInvitationExpiredException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('The invitation has expired', {
      httpStatus: HttpStatus.GONE,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_EXPIRED_ERROR';
  }
}

export class RocketsAuthInvitationAlreadyAcceptedException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('The invitation has already been accepted', {
      httpStatus: HttpStatus.CONFLICT,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_ALREADY_ACCEPTED_ERROR';
  }
}

export class RocketsAuthInvitationInvalidCodeException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('The invitation code is invalid', {
      httpStatus: HttpStatus.BAD_REQUEST,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_INVALID_CODE_ERROR';
  }
}

export class RocketsAuthInvitationInvalidPasscodeException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('The invitation passcode is invalid', {
      httpStatus: HttpStatus.BAD_REQUEST,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_INVALID_PASSCODE_ERROR';
  }
}

export class RocketsAuthInvitationRevokedException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('The invitation has been revoked', {
      httpStatus: HttpStatus.GONE,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_REVOKED_ERROR';
  }
}

export class RocketsAuthInvitationUnauthorizedException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('You are not authorized to perform this action on the invitation', {
      httpStatus: HttpStatus.FORBIDDEN,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_UNAUTHORIZED_ERROR';
  }
}

export class RocketsAuthInvitationCreationFailedException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('Failed to create invitation', {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_CREATION_FAILED_ERROR';
  }
}

export class RocketsAuthInvitationSendFailedException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('Failed to send invitation', {
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_SEND_FAILED_ERROR';
  }
}

export class RocketsAuthInvitationNotAcceptedException extends RocketsAuthInvitationException {
  constructor(options?: RuntimeExceptionOptions) {
    super('The invitation could not be accepted', {
      httpStatus: HttpStatus.BAD_REQUEST,
      ...options,
    });
    this.errorCode = 'ROCKETS_AUTH_INVITATION_NOT_ACCEPTED_ERROR';
  }
}
