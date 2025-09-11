import { ReferenceIdInterface } from '@concepta/nestjs-common';
import { OtpException, OtpService } from '@concepta/nestjs-otp';
import { Inject, Injectable } from '@nestjs/common';
import { RocketsServerAuthUserModelServiceInterface } from '../interfaces/rockets-server-auth-user-model-service.interface';
import {
  ROCKETS_SERVER_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  RocketsServerAuthUserModelService,
} from '../rockets-server-auth.constants';

import { RocketsServerAuthOtpNotificationServiceInterface } from '../interfaces/rockets-server-auth-otp-notification-service.interface';
import { RocketsServerAuthOtpServiceInterface } from '../interfaces/rockets-server-auth-otp-service.interface';
import { RocketsServerAuthSettingsInterface } from '../interfaces/rockets-server-auth-settings.interface';
import { RocketsServerAuthNotificationService } from './rockets-server-auth-notification.service';

@Injectable()
export class RocketsServerAuthOtpService
  implements RocketsServerAuthOtpServiceInterface
{
  constructor(
    @Inject(ROCKETS_SERVER_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsServerAuthSettingsInterface,
    @Inject(RocketsServerAuthUserModelService)
    private readonly userModelService: RocketsServerAuthUserModelServiceInterface,
    private readonly otpService: OtpService,
    @Inject(RocketsServerAuthNotificationService)
    private readonly otpNotificationService: RocketsServerAuthOtpNotificationServiceInterface,
  ) {}

  async sendOtp(email: string): Promise<void> {
    // Find user by email
    const user = await this.userModelService.byEmail(email);
    const { assignment, category, expiresIn } = this.settings.otp;
    if (user) {
      // Generate OTP
      const otp = await this.otpService.create({
        assignment,
        otp: {
          category,
          type: 'uuid',
          assigneeId: user.id,
          expiresIn: expiresIn, // 1 hour expiration
        },
      });

      // Send email with OTP
      await this.otpNotificationService.sendOtpEmail({
        email,
        passcode: otp.passcode,
      });
    }
    // Always return void for security (don't reveal if user exists)
  }

  async confirmOtp(
    email: string,
    passcode: string,
  ): Promise<ReferenceIdInterface> {
    const { assignment, category } = this.settings.otp;
    // Find user by email
    const user = await this.userModelService.byEmail(email);

    if (!user) {
      throw new OtpException();
    }

    // Validate OTP
    const isValid = await this.otpService.validate(
      assignment,
      {
        category: category,
        passcode,
      },
      true,
    );

    if (!isValid) {
      throw new OtpException();
    }

    return user;
  }
}
