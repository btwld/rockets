import { RocketsServerSettingsInterface } from './rockets-server-settings.interface';
import type { AuthProviderInterface } from './auth-provider.interface';

/**
 * Rockets Server module options interface
 */
export interface RocketsServerOptionsInterface { 
  settings: RocketsServerSettingsInterface;
  /**
   * Auth provider implementation to validate tokens
   */
  authProvider: AuthProviderInterface;
}