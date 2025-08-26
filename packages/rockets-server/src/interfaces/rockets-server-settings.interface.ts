import { RocketsServerOtpSettingsInterface } from './rockets-server-otp-settings.interface';

/**
 * Rockets Server settings interface
 */
export interface RocketsServerSettingsInterface {
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
  otp: RocketsServerOtpSettingsInterface;
}
