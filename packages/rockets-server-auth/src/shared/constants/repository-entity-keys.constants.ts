/**
 * Canonical dynamic repository and CRUD entity keys for Rockets Auth.
 *
 * Application code must register TypeORM entities and RepositoryModule entries
 * using these exact string values. They are library contracts, not user-defined keys.
 */
export const RocketsEntity = {
  user: 'user',
  userMetadata: 'userMetadata',
  userCredentials: 'user-credentials',
  userOtp: 'userOtp',
  role: 'role',
  userRole: 'userRole',
} as const;

export const USER_CRUD_ENTITY_KEY = RocketsEntity.user;
export const USER_METADATA_MODULE_ENTITY_KEY = RocketsEntity.userMetadata;
export const USER_CREDENTIALS_ENTITY_KEY = RocketsEntity.userCredentials;
export const USER_OTP_ENTITY_KEY = RocketsEntity.userOtp;
export const ROLE_CRUD_ENTITY_KEY = RocketsEntity.role;
export const USER_ROLE_ENTITY_KEY = RocketsEntity.userRole;

export type RocketsAuthUserOtpAssignment = typeof USER_OTP_ENTITY_KEY;
