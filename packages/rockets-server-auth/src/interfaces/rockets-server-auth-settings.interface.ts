import { RocketsServerAuthOtpSettingsInterface } from './rockets-server-auth-otp-settings.interface';

/**
 * Rockets Server settings interface
 */
export interface RocketsServerAuthSettingsInterface {
  role: {
    adminRoleName: string;
  };
  email: {
    from: string;
    baseUrl: string;
    tokenUrlFormatter?: (baseUrl: string, passcode: string) => string;
    templates: {
      sendOtp: {
        fileName: string;
        subject: string;
      };
    };
  };
  /**
   * OTP settings
   */
  otp: RocketsServerAuthOtpSettingsInterface;
}
