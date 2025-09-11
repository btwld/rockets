import { Injectable, Inject } from '@nestjs/common';
import { EmailSendInterface } from '@concepta/nestjs-common';
import { EmailService } from '@concepta/nestjs-email';
import { RocketsServerAuthSettingsInterface } from '../interfaces/rockets-server-auth-settings.interface';
import { ROCKETS_SERVER_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../rockets-server-auth.constants';
import { RocketsServerAuthOtpNotificationServiceInterface } from '../interfaces/rockets-server-auth-otp-notification-service.interface';

export interface RocketsServerAuthOtpEmailParams {
  email: string;
  passcode: string;
}

@Injectable()
export class RocketsServerAuthNotificationService
  implements RocketsServerAuthOtpNotificationServiceInterface
{
  constructor(
    @Inject(ROCKETS_SERVER_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsServerAuthSettingsInterface,
    @Inject(EmailService)
    private readonly emailService: EmailSendInterface,
  ) {}

  async sendOtpEmail(params: RocketsServerAuthOtpEmailParams): Promise<void> {
    const { email, passcode } = params;
    const { fileName, subject } = this.settings.email.templates.sendOtp;
    const { from, baseUrl } = this.settings.email;

    await this.emailService.sendMail({
      to: email,
      from,
      subject,
      template: fileName,
      context: {
        passcode,
        tokenUrl: `${baseUrl}/${passcode}`,
      },
    });
  }
}
