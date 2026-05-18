import { DynamicModule, Module } from '@nestjs/common';
import {
  RocketsAuthInvitationAcceptanceModuleClass,
  RocketsAuthInvitationAcceptanceOptions,
  RocketsAuthInvitationAcceptanceAsyncOptions,
} from './rockets-auth-invitation-acceptance.module-definition';

/**
 * RocketsAuth Invitation Acceptance Module
 *
 * This module follows the pattern established in rockets-auth.module.ts
 * by extending the ConfigurableModuleClass and providing forRoot/forRootAsync methods.
 *
 * Handles invitation acceptance by users.
 * This is a public endpoint (no authentication required).
 * Security is provided by the OTP validation.
 */
@Module({})
export class RocketsAuthInvitationAcceptanceModule extends RocketsAuthInvitationAcceptanceModuleClass {
  static forRoot(
    options: RocketsAuthInvitationAcceptanceOptions,
  ): DynamicModule {
    return super.register({ ...options, global: true });
  }

  static forRootAsync(
    options: RocketsAuthInvitationAcceptanceAsyncOptions,
  ): DynamicModule {
    return super.registerAsync({
      ...options,
      global: true,
    });
  }
}

// Re-export for convenience
export {
  INVITATION_ACCEPTANCE_LISTENER_TOKEN,
  type InvitationAcceptedEventHandler,
} from './rockets-auth-invitation-acceptance.module-definition';
