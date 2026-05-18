export { RocketsAuthModule } from './rockets-auth.module';
export { defineRocketsAuth } from './define-rockets-auth';
export type { DefineRocketsAuthInput } from './define-rockets-auth';

export * from './domains/auth';
export * from './domains/user';
// TODO(upstream: concepta/nestjs-auth-apple|github|google) — re-add
// `export * from './domains/oauth'` once v8 OAuth provider packages ship.
// The domain is parked under `domains/oauth/` (controller body preserved
// in a block comment for fast restore).
export * from './domains/otp';
export * from './domains/role';
export * from './domains/invitation';

export * from './shared';

export { RocketsJwtAuthAdapter } from './provider/rockets-jwt-auth.adapter';

export { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from './shared/constants/rockets-auth.constants';

// Access-control re-exports — so consumers single-source from
// `@bitwild/rockets-server-auth` instead of dual-importing from
// `@concepta/nestjs-access-control`. Mirrors what `RocketsAuthModule`
// actually wires when `extras.accessControl` is provided.
export {
  AccessControlModule,
  AccessControlGuard,
  AccessControlFilter,
  AccessControlContext,
  AccessControlService,
  AccessControlCreateMany,
  AccessControlCreateOne,
  AccessControlDeleteOne,
  AccessControlGrant,
  AccessControlQuery,
  AccessControlReadMany,
  AccessControlReadOne,
  AccessControlRecoverOne,
  AccessControlReplaceOne,
  AccessControlUpdateOne,
  ActionEnum,
  PossessionEnum,
  AccessControlAction,
} from '@concepta/nestjs-access-control';
export type {
  AccessControlOptionsInterface,
  AccessControlContextInterface,
  CanAccess,
} from '@concepta/nestjs-access-control';

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
