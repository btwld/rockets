import { USER_OTP_ENTITY_KEY } from './repository-entity-keys.constants';

export const ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN =
  'ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN';

/**
 * OTP assignment constant for user-scoped OTP.
 * Must match the entity key used in OtpModule configuration.
 */
export const ROCKETS_AUTH_OTP_ASSIGNMENT = USER_OTP_ENTITY_KEY;
