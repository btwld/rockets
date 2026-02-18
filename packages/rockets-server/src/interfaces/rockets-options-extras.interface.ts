import { DynamicModule } from '@nestjs/common';

/**
 * Configuration interface for disabling specific controllers.
 */
export interface DisableControllerOptionsInterface {
  /** Disable the `/me` controller. */
  me?: boolean;
}

/**
 * Rockets module extras interface
 */
export interface RocketsOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  /**
   * Register `AuthGuard` as an application-wide guard.
   */
  enableGlobalGuard?: boolean;

  /**
   * Controller disable switches.
   */
  disableController?: DisableControllerOptionsInterface;
}
