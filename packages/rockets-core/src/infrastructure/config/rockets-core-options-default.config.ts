import type { FactoryProvider } from '@nestjs/common';
import { RocketsCoreSettingsInterface } from './interfaces/rockets-core-settings.interface';

/**
 * Token of the provider holding the module's default settings. Injected by
 * `createSettingsProvider` as the fallback when the app passes no
 * `settings` — a plain Nest provider, no `@nestjs/config` involved.
 */
export const ROCKETS_CORE_SETTINGS_DEFAULTS_TOKEN =
  'ROCKETS_CORE_SETTINGS_DEFAULTS_TOKEN';

export const rocketsCoreDefaultConfig = {
  provide: ROCKETS_CORE_SETTINGS_DEFAULTS_TOKEN,
  useFactory: (): RocketsCoreSettingsInterface => ({}),
} satisfies FactoryProvider<RocketsCoreSettingsInterface>;
