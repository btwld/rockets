import type { RuntimeExceptionOptions } from '@concepta/nestjs-core';
import { OtpException } from '@concepta/nestjs-otp';

/**
 * OTP failures surfaced through Rockets Auth (distinct errorCode from upstream {@link OtpException}).
 * Still extends concepta's exception so existing `instanceof OtpException` checks remain valid.
 */
export class RocketsAuthOtpException extends OtpException {
  constructor(options?: RuntimeExceptionOptions) {
    super(options);
    this.errorCode = 'ROCKETS_AUTH_OTP_ERROR';
  }
}
