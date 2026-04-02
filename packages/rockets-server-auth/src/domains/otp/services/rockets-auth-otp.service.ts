import {
  ReferenceIdInterface,
  RuntimeException,
} from '@concepta/nestjs-common';
import { OtpException } from '@concepta/nestjs-otp';
import {
  RocketsAuthOtpPortService,
  ROCKETS_AUTH_OTP_PORT_TOKEN,
} from '../../../shared/ports/rockets-auth-otp-port.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { RocketsAuthUserModelServiceInterface } from '../../../shared/interfaces/rockets-auth-user-model-service.interface';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  RocketsAuthUserModelService,
} from '../../../shared/constants/rockets-auth.constants';

import { RocketsAuthOtpNotificationServiceInterface } from '../interfaces/rockets-auth-otp-notification-service.interface';
import { RocketsAuthOtpServiceInterface } from '../interfaces/rockets-auth-otp-service.interface';
import { RocketsAuthSettingsInterface } from '../../../shared/interfaces/rockets-auth-settings.interface';
import { RocketsAuthNotificationService } from './rockets-auth-notification.service';
import { RocketsAuthException } from '../../../shared/exceptions/rockets-auth.exception';
import { logAndGetErrorDetails } from '../../../shared/utils/error-logging.helper';

@Injectable()
export class RocketsAuthOtpService implements RocketsAuthOtpServiceInterface {
  private readonly logger = new Logger(RocketsAuthOtpService.name);

  constructor(
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
    @Inject(RocketsAuthUserModelService)
    private readonly userModelService: RocketsAuthUserModelServiceInterface,
    @Inject(ROCKETS_AUTH_OTP_PORT_TOKEN)
    private readonly otpService: RocketsAuthOtpPortService,
    @Inject(RocketsAuthNotificationService)
    private readonly otpNotificationService: RocketsAuthOtpNotificationServiceInterface,
  ) {}

  async sendOtp(email: string): Promise<void> {
    try {
      const user = await this.userModelService.byEmail(email);
      const { assignment, category, expiresIn } = this.settings.otp;

      if (user) {
        const otp = await this.otpService.create({
          assignment,
          otp: {
            category,
            type: 'uuid',
            assigneeId: user.id,
            expiresIn,
          },
        });

        await this.otpNotificationService.sendOtpEmail({
          email,
          passcode: otp.passcode,
        });

        this.logger.log('OTP sent successfully', {
          category,
          expiresIn,
          timestamp: new Date().toISOString(),
        });
      } else {
        this.logger.log('OTP request for non-existent user');
      }
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
    // Always return void for security (don't reveal if user exists)
  }

  async confirmOtp(
    email: string,
    passcode: string,
  ): Promise<ReferenceIdInterface> {
    const { assignment, category } = this.settings.otp;
    const user = await this.userModelService.byEmail(email);

    if (!user) {
      throw new OtpException();
    }

    const isValid = await this.otpService.validate(
      assignment,
      { category, passcode },
      true,
    );

    if (!isValid) {
      throw new OtpException();
    }

    return user;
  }
}
