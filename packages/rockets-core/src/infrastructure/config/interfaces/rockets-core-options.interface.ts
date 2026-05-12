import type { SwaggerUiOptionsInterface } from '@bitwild/rockets-common';
import type { RocketsCoreSettingsInterface } from './rockets-core-settings.interface';

export interface RocketsCoreOptionsInterface {
  readonly settings?: RocketsCoreSettingsInterface;
  readonly swagger?: SwaggerUiOptionsInterface;
}
