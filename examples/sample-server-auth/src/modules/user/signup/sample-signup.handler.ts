import { Injectable } from '@nestjs/common';
import {
  RocketsAuthUserEntityInterface,
  SignupUserCommand,
  SignupUserHandler,
} from '@concepta/rockets-auth';

import { BlockedEmailDomainException } from './blocked-email-domain.exception';

export const BLOCKED_SIGNUP_DOMAINS = ['mailinator.com', 'example.invalid'];

/**
 * Signup policy override (`userCrud.handlers.signupHandler`).
 *
 * Extends the built-in handler instead of the abstract seam so the whole
 * signup transaction (user + metadata + default role) is inherited; only
 * the policy in front of it is the app's.
 */
@Injectable()
export class SampleSignupHandler extends SignupUserHandler {
  async execute(
    command: SignupUserCommand,
  ): Promise<RocketsAuthUserEntityInterface> {
    const domain = command.dto.email.split('@')[1]?.toLowerCase() ?? '';
    if (BLOCKED_SIGNUP_DOMAINS.includes(domain)) {
      throw new BlockedEmailDomainException(domain);
    }
    return super.execute(command);
  }
}
