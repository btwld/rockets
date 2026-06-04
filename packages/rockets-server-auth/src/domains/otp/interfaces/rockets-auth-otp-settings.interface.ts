import { ReferenceAssignment } from '@bitwild/rockets-app';
import { OtpCreatableInterface } from '@concepta/nestjs-otp';

/**
 * Rockets Server OTP settings interface
 */
export interface RocketsAuthOtpSettingsInterface
  extends Pick<OtpCreatableInterface, 'category' | 'type' | 'expiresIn'>,
    Partial<Pick<OtpCreatableInterface, 'rateSeconds' | 'rateThreshold'>> {
  /**
   * Assignment for the OTP
   */
  assignment: ReferenceAssignment;

  /**
   * Whether to clear existing OTPs on create
   */
  clearOtpOnCreate?: boolean;
}
