import {
  LiteralObject,
  InvitationAcceptedEventPayloadInterface,
  InvitationInterface,
} from '@concepta/nestjs-common';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../user/interfaces/rockets-auth-user-metadata-updatable.interface';

/**
 * Payload data accepted during invitation acceptance.
 *
 * The default listener only applies `password` and `userMetadata`.
 * Additional properties are allowed for application-specific extensions.
 */
export interface InvitationAcceptanceDataInterface extends LiteralObject {
  /**
   * User password to set during invitation acceptance.
   * Will be hashed before storage using the configured password service.
   */
  password?: string;

  /** Metadata patch validated with `userCrud.userMetadataConfig.updateDto` when configured. */
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
