export const ROCKETS_CORE_SETTINGS_TOKEN =
  'ROCKETS_CORE_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN';

/**
 * Injects the full auth chain as `ReadonlyArray<AuthAdapterInterface>`,
 * in priority order. The {@link AuthServerGuard} iterates this array
 * and stops on the first conclusive result (success or rejection).
 */
export const AUTH_ADAPTERS_TOKEN = Symbol('ROCKETS_AUTH_ADAPTERS');

// Use the same string value as @concepta/nestjs-authentication for backward compatibility
// with existing @AuthPublic() decorators from concepta packages
export const ROCKETS_DISABLE_GUARDS_TOKEN =
  'AUTHENTICATION_MODULE_DISABLE_GUARDS_TOKEN';

export const USER_METADATA_MODULE_ENTITY_KEY = 'userMetadata';

export const USER_MODULE_USER_ENTITY_KEY = 'user';
