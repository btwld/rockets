/**
 * Injection token for `RocketsAuthModule.forRoot(Async)` options.
 * Lives in its own module so global/port bridge modules can inject it without
 * importing `rockets-auth.module-definition` (which would create circular deps).
 */
export const RAW_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_AUTH_MODULE_RAW_OPTIONS_TOKEN__',
);
