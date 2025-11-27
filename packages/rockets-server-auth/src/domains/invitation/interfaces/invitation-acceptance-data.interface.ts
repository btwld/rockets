import {
  LiteralObject,
  InvitationAcceptedEventPayloadInterface,
  InvitationInterface,
} from '@concepta/nestjs-common';

/**
 * Interface for invitation acceptance data payload
 *
 * This defines the structure of the data object that can be passed
 * when accepting an invitation.
 *
 * SECURITY NOTE: Role assignment is NOT controlled via this payload.
 * The role must be set at invitation creation time via invitation.constraints.roleId
 * (admin-controlled). This prevents privilege escalation attacks where users could
 * assign themselves arbitrary roles through the public acceptance endpoint.
 * Any roleId passed in this payload will be ignored.
 */
export interface InvitationAcceptanceDataInterface extends LiteralObject {
  /**
   * User password to set during invitation acceptance
   */
  password?: string;

  /**
   * User metadata to create or update
   */
  userMetadata?: Record<string, unknown>;

  /**
   * Additional user fields to update (firstName, lastName, email, etc.)
   */
  [key: string]: unknown;
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
