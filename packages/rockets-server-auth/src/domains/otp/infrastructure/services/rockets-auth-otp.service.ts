import { ReferenceIdInterface, RuntimeException } from '@bitwild/rockets-app';
import {
  RocketsAuthOtpPortService,
  ROCKETS_AUTH_OTP_PORT_TOKEN,
} from '../../../../shared/ports/rockets-auth-otp-port.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OtpInterface } from '@concepta/nestjs-otp';
import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
} from '../../../../shared/ports/rockets-auth-user-port.service';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../../../../shared/constants/rockets-auth.constants';

import { RocketsAuthOtpNotificationServiceInterface } from '../../interfaces/rockets-auth-otp-notification-service.interface';
import { RocketsAuthOtpServiceInterface } from '../../interfaces/rockets-auth-otp-service.interface';
import { RocketsAuthSettingsInterface } from '../../../../shared/interfaces/rockets-auth-settings.interface';
import { RocketsAuthNotificationService } from './rockets-auth-notification.service';
import { RocketsAuthException } from '../../../../shared/exceptions/rockets-auth.exception';
import { logAndGetErrorDetails } from '../../../../shared/utils/error-logging.helper';
import { RocketsAuthOtpException } from '../../domain/exceptions/rockets-auth-otp.exception';

/**
 * OTP service split into per-method seams. Subclass and override only the
 * step you need:
 *
 *   sendOtp:
 *     - `resolveUser`  — change how a user is looked up by email
 *     - `issueOtp`     — change OTP issuance (cooldown, type override, …)
 *     - `deliver`      — swap email channel for SMS / push / etc.
 *
 *   confirmOtp:
 *     - `resolveUser`  — shared with sendOtp by default
 *     - `validatePasscode` — change validation strategy
 *
 * Register an override via
 * `{ provide: RocketsAuthOtpService, useClass: MyOtpService }`.
 *
 * See `.context/v8-ddd-refactor-plan.md` §3.3.
 */
@Injectable()
export class RocketsAuthOtpService implements RocketsAuthOtpServiceInterface {
  protected readonly logger = new Logger(RocketsAuthOtpService.name);

  constructor(
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    protected readonly settings: RocketsAuthSettingsInterface,
    @Inject(ROCKETS_AUTH_USER_PORT_TOKEN)
    protected readonly userPort: RocketsAuthUserPortService,
    @Inject(ROCKETS_AUTH_OTP_PORT_TOKEN)
    protected readonly otpService: RocketsAuthOtpPortService,
    @Inject(RocketsAuthNotificationService)
    protected readonly otpNotificationService: RocketsAuthOtpNotificationServiceInterface,
  ) {}

  async sendOtp(email: string): Promise<void> {
    try {
      const user = await this.resolveUser(email);
      if (!user) {
        this.logger.log('OTP request for non-existent user');
        return;
      }

      const otp = await this.issueOtp(user);
      await this.deliver(email, otp);

      const { category, expiresIn } = this.settings.otp;
      this.logger.log('OTP sent successfully', {
        category,
        expiresIn,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const { errorMessage } = logAndGetErrorDetails(
        error,
        this.logger,
        'OTP send failed',
        { errorId: 'OTP_SEND_FAILED' },
      );
      if (error instanceof RuntimeException) {
        throw error;
      }
      throw new RocketsAuthException(errorMessage);
    }
    // Return void regardless — never reveal whether the email exists.
  }

  async confirmOtp(
    email: string,
    passcode: string,
  ): Promise<ReferenceIdInterface> {
    const user = await this.resolveUser(email);
    if (!user) {
      throw new RocketsAuthOtpException();
    }

    const valid = await this.validatePasscode(user, passcode);
    if (!valid) {
      throw new RocketsAuthOtpException();
    }
    return user;
  }

  /** Look up the user by email. Override to add caching, fallbacks, etc. */
  protected async resolveUser(
    email: string,
  ): Promise<ReferenceIdInterface | null> {
    return this.userPort.byEmail(email);
  }

  /** Issue an OTP for the given user. Override to add cooldown / rate limit. */
  protected async issueOtp(user: ReferenceIdInterface): Promise<OtpInterface> {
    const { assignment, category, expiresIn } = this.settings.otp;
    return this.otpService.create({
      assignment,
      otp: {
        category,
        type: 'uuid',
        assigneeId: user.id,
        expiresIn,
      },
    });
  }

  /** Deliver the OTP. Override to swap email for SMS / push / etc. */
  protected async deliver(
    email: string,
    otp: Pick<OtpInterface, 'passcode'>,
  ): Promise<void> {
    await this.otpNotificationService.sendOtpEmail({
      email,
      passcode: otp.passcode,
    });
  }

  /** Validate a passcode for the given user. Override for alternate flows. */
  protected async validatePasscode(
    user: ReferenceIdInterface,
    passcode: string,
  ): Promise<boolean> {
    const { assignment, category } = this.settings.otp;
    const result = await this.otpService.validate(
      assignment,
      { category, passcode },
      true,
    );
    // Defense-in-depth: if upstream returns a relation, ensure it ties back
    // to the resolved user before declaring the passcode valid.
    if (!result) return false;
    if ('assigneeId' in result && result.assigneeId !== user.id) return false;
    return true;
  }
}
