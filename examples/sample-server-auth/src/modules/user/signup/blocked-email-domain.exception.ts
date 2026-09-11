import { HttpStatus } from '@nestjs/common';
import { RocketsAuthException } from '@concepta/rockets-auth';

/**
 * App-owned auth error: extends the package base so the Rockets error
 * envelope, `errorCode` and HTTP status come out like every built-in one.
 */
export class BlockedEmailDomainException extends RocketsAuthException {
  constructor(domain: string) {
    super(`Signups from "${domain}" addresses are not accepted`, {
      httpStatus: HttpStatus.FORBIDDEN,
    });
    this.errorCode = 'SAMPLE_SIGNUP_DOMAIN_BLOCKED';
  }
}
