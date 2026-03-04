import { registerAs } from '@nestjs/config';
import { ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../rockets.constants';
import { RocketsSettingsInterface } from '../interfaces/rockets-settings.interface';

/**
 * Default configuration for Rockets module settings.
 */
export const rocketsOptionsDefaultConfig = registerAs(
  ROCKETS_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  (): RocketsSettingsInterface => ({}),
);
