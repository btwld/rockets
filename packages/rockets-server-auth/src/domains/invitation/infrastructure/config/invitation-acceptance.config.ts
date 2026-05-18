import { Type } from '@nestjs/common';
import { RocketsAuthUserMetadataModelUpdatableInterface } from '../../../user/interfaces/rockets-auth-user-metadata-updatable.interface';

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
   * Optional update DTO class used to validate user-supplied
   * `userMetadata` payloads on invitation acceptance. When undefined,
   * the metadata is forwarded as-is to `SaveUserMetadataCommand`.
   */
  userMetadataUpdateDto?: Type<RocketsAuthUserMetadataModelUpdatableInterface>;
}
