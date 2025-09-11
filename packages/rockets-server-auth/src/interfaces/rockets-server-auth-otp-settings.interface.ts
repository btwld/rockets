import {
  OtpCreatableInterface,
  ReferenceAssignment,
} from '@concepta/nestjs-common';

/**
 * Rockets Server OTP settings interface
 */
export interface RocketsServerAuthOtpSettingsInterface
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
