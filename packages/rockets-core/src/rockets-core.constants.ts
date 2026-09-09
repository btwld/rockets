export const ROCKETS_CORE_SETTINGS_TOKEN =
  'ROCKETS_CORE_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN';

/**
 * Injects the full auth chain as `ReadonlyArray<AuthAdapterInterface>`,
 * in priority order. The {@link AuthServerGuard} iterates this array
 * and stops on the first conclusive result (success or rejection).
 */
export const AUTH_ADAPTERS_TOKEN = Symbol('ROCKETS_AUTH_ADAPTERS');

export const USER_METADATA_MODULE_ENTITY_KEY = 'userMetadata';

/**
 * Columns of the user-metadata row the server owns: the primary key, the
 * ownership link, and the audit timestamps. They are never writable
 * through `PATCH /me`, whatever an app's `updateSchema` declares — the
 * boot-time check rejects a schema that declares one, and the write path
 * strips them anyway, because a `PATCH /me` carrying `id` would hand
 * `repo.update` a foreign primary key.
 *
 * `defineZodUserMetadata` omits the same list from the update projection.
 */
export const USER_METADATA_MANAGED_FIELDS = [
  'id',
  'userId',
  'dateCreated',
  'dateUpdated',
  'dateDeleted',
  'version',
] as const;

export const USER_MODULE_USER_ENTITY_KEY = 'user';

/**
 * DI token for {@link CsrfGuardOptions} — an app provides this only when
 * it registers `CsrfGuard` (issue #58).
 */
export const CSRF_GUARD_OPTIONS_TOKEN = Symbol('ROCKETS_CSRF_GUARD_OPTIONS');
