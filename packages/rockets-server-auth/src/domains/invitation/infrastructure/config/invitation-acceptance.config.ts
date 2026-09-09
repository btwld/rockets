import type { z } from 'zod';

export const INVITATION_ACCEPTANCE_CONFIG_TOKEN = Symbol(
  '__ROCKETS_INVITATION_ACCEPTANCE_CONFIG__',
);

/**
 * DI-injected runtime config for the invitation acceptance listener.
 * Carries only the values the listener actually needs at runtime, instead
 * of the entire raw module-options blob.
 */
export interface InvitationAcceptanceConfig {
  /**
   * Named schema that validates user-supplied `userMetadata` payloads on
   * invitation acceptance: the app's `userCrud.userMetadataConfig.updateSchema`,
   * or the base default that strips every key. Never undefined — the
   * listener has no unvalidated path.
   */
  userMetadataUpdateSchema: z.ZodType;
}
