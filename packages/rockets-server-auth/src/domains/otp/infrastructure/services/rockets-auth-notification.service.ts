import { Injectable, Inject, Logger } from '@nestjs/common';
import { EmailSendInterface, RuntimeException } from '@concepta/nestjs-common';
import { EmailService } from '@concepta/nestjs-email';
import { RocketsAuthSettingsInterface } from '../../../../shared/interfaces/rockets-auth-settings.interface';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../../../../shared/constants/rockets-auth.constants';
import { RocketsAuthOtpNotificationServiceInterface } from '../../interfaces/rockets-auth-otp-notification-service.interface';
import { RocketsAuthException } from '../../../../shared/exceptions/rockets-auth.exception';
import { logAndGetErrorDetails } from '../../../../shared/utils/error-logging.helper';

export interface RocketsAuthOtpEmailParams {
  email: string;
  passcode: string;
}

@Injectable()
export class RocketsAuthNotificationService
  implements RocketsAuthOtpNotificationServiceInterface
{
  private readonly logger = new Logger(RocketsAuthNotificationService.name);

  constructor(
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
    @Inject(EmailService)
    private readonly emailService: EmailSendInterface,
  ) {}

  async sendOtpEmail(params: RocketsAuthOtpEmailParams): Promise<void> {
    const { email, passcode } = params;

    try {
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

      this.logger.log('OTP email sent successfully');
    } catch (error) {
      const { errorMessage } = logAndGetErrorDetails(
        error,
        this.logger,
        'Failed to send OTP email',
        { errorId: 'OTP_EMAIL_SEND_FAILED' },
      );

      if (error instanceof RuntimeException) {
        throw error;
      }

      throw new RocketsAuthException(errorMessage);
    }
  }
}
