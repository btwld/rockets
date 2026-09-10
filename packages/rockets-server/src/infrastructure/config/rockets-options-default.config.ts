import type { FactoryProvider } from '@nestjs/common';
import { RocketsSettingsInterface } from './interfaces/rockets-settings.interface';

/**
 * Token of the provider holding the server module's default settings.
 * Registered by `RocketsModule` itself — it no longer piggybacks on the
 * core module's defaults through a shared `@nestjs/config` namespace.
 */
export const ROCKETS_SERVER_SETTINGS_DEFAULTS_TOKEN =
  'ROCKETS_SERVER_SETTINGS_DEFAULTS_TOKEN';

export const rocketsOptionsDefaultConfig = {
  provide: ROCKETS_SERVER_SETTINGS_DEFAULTS_TOKEN,
  useFactory: (): RocketsSettingsInterface => ({}),
} satisfies FactoryProvider<RocketsSettingsInterface>;
