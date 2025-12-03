import {
  LiteralObject,
  InvitationAcceptedEventPayloadInterface,
  InvitationInterface,
} from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../user/interfaces/rockets-auth-user-metadata-updatable.interface';

/**
 * Interface for invitation acceptance data payload
 *
 * This defines the structure of the data object that can be passed
 * when accepting an invitation.
 *
 * SECURITY NOTES:
 * - Role assignment is NOT controlled via this payload. The role must be set at invitation
 *   creation time via invitation.constraints.roleId (admin-controlled). Any roleId passed
 *   in this payload will be ignored.
 * - Only password and userMetadata are accepted. User fields (active, email, username, etc.)
 *   cannot be updated via this endpoint to prevent mass assignment attacks.
 * - firstName and lastName are moved to userMetadata automatically.
 * - userMetadata is validated using the DTO configured in userCrud.userMetadataConfig.updateDto
 *   if available, otherwise basic validation is applied.
 */
export interface InvitationAcceptanceDataInterface extends LiteralObject {
  /**
   * User password to set during invitation acceptance
   * Will be hashed before storage
   */
  password?: string;

  /**
   * User metadata to create or update
   * Validated using userCrud.userMetadataConfig.updateDto if configured
   * Fields like firstName, lastName, bio, etc. should be included here
   */
  userMetadata?: RocketsAuthUserMetadataUpdatableInterface;
}

/**
 * Generic version of InvitationAcceptedEventPayloadInterface
 * with strongly-typed data field
 */
export interface TypedInvitationAcceptedEventPayloadInterface<
  TData extends LiteralObject = LiteralObject,
> extends Omit<InvitationAcceptedEventPayloadInterface, 'data'> {
  invitation: InvitationInterface;
  data?: TData;
}
