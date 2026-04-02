export { RocketsAuthModule } from './rockets-auth.module';

export * from './domains/auth';
export * from './domains/user';
export * from './domains/oauth';
export * from './domains/otp';
export * from './domains/role';
export * from './domains/invitation';

export * from './shared';

export { generateSwaggerJson } from './generate-swagger';
export { RocketsJwtAuthProvider } from './provider/rockets-jwt-auth.provider';

export {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  ADMIN_USER_CRUD_SERVICE_TOKEN,
  ADMIN_ROLE_CRUD_SERVICE_TOKEN,
} from './shared/constants/rockets-auth.constants';

export type { RocketsAuthOptionsInterface } from './shared/interfaces/rockets-auth-options.interface';
export type { RocketsAuthOptionsExtrasInterface } from './shared/interfaces/rockets-auth-options-extras.interface';
export type { RocketsAuthUserInterface } from './domains/user/interfaces/rockets-auth-user.interface';
export type { RocketsAuthUserCreatableInterface } from './domains/user/interfaces/rockets-auth-user-creatable.interface';
export type { RocketsAuthUserUpdatableInterface } from './domains/user/interfaces/rockets-auth-user-updatable.interface';
export type { RocketsAuthUserEntityInterface } from './domains/user/interfaces/rockets-auth-user-entity.interface';
export type { RocketsAuthRoleInterface } from './domains/role/interfaces/rockets-auth-role.interface';
export type { RocketsAuthRoleCreatableInterface } from './domains/role/interfaces/rockets-auth-role-creatable.interface';
export type { RocketsAuthRoleUpdatableInterface } from './domains/role/interfaces/rockets-auth-role-updatable.interface';
export type { RocketsAuthRoleEntityInterface } from './domains/role/interfaces/rockets-auth-role-entity.interface';
export type { RocketsAuthUserMetadataEntityInterface } from './domains/user/interfaces/rockets-auth-user-metadata-entity.interface';
export type { RocketsAuthUserMetadataCreatableInterface } from './domains/user/interfaces/rockets-auth-user-metadata-creatable.interface';
export type { RocketsAuthUserMetadataRequestInterface } from './domains/user/interfaces/rockets-auth-user-metadata-request.interface';
