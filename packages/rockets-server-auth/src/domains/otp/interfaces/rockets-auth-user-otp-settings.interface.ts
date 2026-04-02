import type { RocketsAuthUserOtpAssignment } from '../../../shared/constants/repository-entity-keys.constants';
import { RocketsAuthOtpSettingsInterface } from './rockets-auth-otp-settings.interface';

/**
 * User-specific OTP settings interface
 *
 * Enforces assignment to the canonical user OTP entity key (see `USER_OTP_ENTITY_KEY`),
 * matching OtpModule configuration.
 *
 * Future: RocketsAuthOrgOtpSettingsInterface will follow the same pattern for 'orgOtp'
 */
export interface RocketsAuthUserOtpSettingsInterface
  extends Omit<RocketsAuthOtpSettingsInterface, 'assignment'> {
  /**
   * Assignment for user OTP — must match `USER_OTP_ENTITY_KEY` / `ROCKETS_AUTH_OTP_ASSIGNMENT`
   */
  assignment: RocketsAuthUserOtpAssignment;
}
