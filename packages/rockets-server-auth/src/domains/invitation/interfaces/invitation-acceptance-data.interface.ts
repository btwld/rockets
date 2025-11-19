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
   * Role ID to assign to the user
   * If provided, this role will be assigned instead of the default role
   */
  roleId?: string;

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
