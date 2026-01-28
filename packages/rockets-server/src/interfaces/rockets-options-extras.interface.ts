import { DynamicModule } from '@nestjs/common';

/**
 * Configuration interface for disabling specific controllers.
 *
 * All controllers are **enabled by default**. Set a property to `true` to disable
 * that specific controller. This allows SDK users to selectively disable features
 * they don't need without requiring explicit enablement of every feature.
 *
 * @example
 * ```typescript
 * // Disable only the /me controller
 * disableController: {
 *   me: true,
 * }
 * ```
 *
 * @example
 * ```typescript
 * // All controllers enabled (default behavior, no config needed)
 * disableController: {}
 * ```
 */
export interface DisableControllerOptionsInterface {
  /** Set to `true` to disable the /me controller. Default: false (enabled) */
  me?: boolean;
}

/**
 * Rockets module extras interface
 */
export interface RocketsOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'controllers'> {
  /**
   * Enable global auth guard
   * When true, registers AuthGuard as APP_GUARD globally
   * When false, only provides AuthGuard as a service (not global)
   * Default: true
   */
  enableGlobalGuard?: boolean;

  /**
   * Options to disable specific controllers.
   * All controllers are enabled by default.
   */
  disableController?: DisableControllerOptionsInterface;
}
