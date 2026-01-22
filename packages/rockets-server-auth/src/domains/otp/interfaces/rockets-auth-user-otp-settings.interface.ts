import { RocketsAuthOtpSettingsInterface } from './rockets-auth-otp-settings.interface';

/**
 * User-specific OTP settings interface
 *
 * Enforces assignment to 'userOtp' which matches the OTP module entity configuration.
 * This ensures type safety and prevents misconfiguration of the OTP assignment.
 *
 * Future: RocketsAuthOrgOtpSettingsInterface will follow the same pattern for 'orgOtp'
 */
export interface RocketsAuthUserOtpSettingsInterface
  extends Omit<RocketsAuthOtpSettingsInterface, 'assignment'> {
  /**
   * Assignment for user OTP - fixed to 'userOtp'
   * This value must match the entity key used in OtpModule configuration
   */
  assignment: 'userOtp';
}
