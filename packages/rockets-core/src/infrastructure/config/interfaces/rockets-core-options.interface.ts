import type { RocketsCoreSettingsInterface } from './rockets-core-settings.interface';
import { type SwaggerUiOptionsInterface } from '@bitwild/rockets-common';

export interface RocketsCoreOptionsInterface {
  readonly settings?: RocketsCoreSettingsInterface;
  readonly swagger?: SwaggerUiOptionsInterface;
}
