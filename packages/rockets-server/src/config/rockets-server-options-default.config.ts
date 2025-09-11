import { registerAs } from '@nestjs/config';
import { ROCKETS_SERVER_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../rockets-server.constants';
import { RocketsServerSettingsInterface } from '../interfaces/rockets-server-settings.interface';


/**
 * Authentication combined configuration
 *
 * This combines all authentication-related configurations into a single namespace.
 */
export const rocketsServerOptionsDefaultConfig = registerAs(
  ROCKETS_SERVER_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  (): RocketsServerSettingsInterface => {
    return {}
  });
