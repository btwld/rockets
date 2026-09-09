import { ReferenceIdInterface } from '@concepta/nestjs-core';
import { InvitationInterface } from '@concepta/nestjs-invitation';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../user/interfaces/rockets-auth-user-metadata-updatable.interface';

/**
 * Payload data accepted during invitation acceptance.
 *
 * The default listener only applies `password` and `userMetadata`.
 * Additional properties are allowed for application-specific extensions.
 */
export interface InvitationAcceptanceDataInterface
  extends Record<string, unknown> {
  /**
   * User password to set during invitation acceptance.
   * Will be hashed before storage using the configured password service.
   */
  password?: string;

  /** Metadata patch validated with `userCrud.userMetadataConfig.updateSchema` when configured. */
  userMetadata?: RocketsAuthUserMetadataUpdatableInterface;
}

/**
 * Mirrors the shape of the upstream InvitationAcceptedEventPayloadInterface
 * (not publicly exported from barrels) with a strongly-typed data field.
 */
export interface TypedInvitationAcceptedEventPayloadInterface<
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  invitation: ReferenceIdInterface & InvitationInterface;
  data?: TData;
}
