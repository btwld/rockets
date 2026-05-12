export const ROCKETS_CORE_SETTINGS_TOKEN =
  'ROCKETS_CORE_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN';

export const AUTH_ADAPTER_TOKEN = Symbol('ROCKETS_AUTH_PROVIDER');

// Use the same string value as @concepta/nestjs-authentication for backward compatibility
// with existing @AuthPublic() decorators from concepta packages
export const ROCKETS_DISABLE_GUARDS_TOKEN =
  'AUTHENTICATION_MODULE_DISABLE_GUARDS_TOKEN';

export const USER_METADATA_MODULE_ENTITY_KEY = 'userMetadata';

export const USER_MODULE_USER_ENTITY_KEY = 'user';
