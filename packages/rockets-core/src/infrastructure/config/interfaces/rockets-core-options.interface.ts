import type { SwaggerUiOptionsInterface } from '@bitwild/rockets-common';
import type { AuthProviderInterface } from '../../../domain/interfaces/auth-provider.interface';
import type { RocketsCoreSettingsInterface } from './rockets-core-settings.interface';

export interface RocketsCoreOptionsInterface {
  readonly authProvider: AuthProviderInterface;
  readonly settings?: RocketsCoreSettingsInterface;
  readonly swagger?: SwaggerUiOptionsInterface;
}
