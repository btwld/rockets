import { registerAs } from '@nestjs/config';
import { ROCKETS_CORE_SETTINGS_TOKEN } from '../../rockets-core.constants';
import { RocketsCoreSettingsInterface } from './interfaces/rockets-core-settings.interface';

export const rocketsCoreDefaultConfig = registerAs(
  ROCKETS_CORE_SETTINGS_TOKEN,
  (): RocketsCoreSettingsInterface => ({}),
);
