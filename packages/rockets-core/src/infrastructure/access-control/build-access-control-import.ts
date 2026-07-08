import { DynamicModule } from '@nestjs/common';
import { AccessControlModule } from '@concepta/nestjs-access-control';
import { RocketsAccessControlConfig } from '../config/interfaces/rockets-core-options-extras.interface';

/**
 * Builds the `AccessControlModule.forRoot` import from a
 * {@link RocketsAccessControlConfig}. Shared by `RocketsCoreModule` and
 * `rockets-server-auth` so both wire access control identically.
 *
 * The whole config is forwarded (settings, service, appFilter, `ports`,
 * imports, queryServices). `appGuard` in particular is passed AS-IS with no
 * defaulting: upstream treats `false` as "no global guard" and any nullish
 * value as "use the default `AccessControlGuard` instance from DI as
 * APP_GUARD". This is load-bearing because
 * `AccessControlGuard.getQueryService` uses a STRICT `moduleRef.resolve()`
 * that only sees providers on the SAME module the guard instance lives in.
 * As APP_GUARD its host module is `AccessControlModule` — the same module
 * that receives `queryServices` — so the strict resolve succeeds. Guarding a
 * controller with `@UseGuards(AccessControlGuard)` instead would instantiate
 * the guard in the controller's module scope, where queryServices are NOT
 * registered, and every request would 500 with `UnknownElementException`.
 */
export function buildAccessControlImport(
  config: RocketsAccessControlConfig,
): DynamicModule {
  return AccessControlModule.forRoot({ ...config });
}
