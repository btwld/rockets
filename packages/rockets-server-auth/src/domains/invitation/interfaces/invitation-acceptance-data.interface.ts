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
 * **SDK Extensibility:**
 * This interface extends `LiteralObject` to allow SDK users to pass additional
 * fields specific to their implementation. The base interface provides common
 * fields (`password`, `userMetadata`), but your application may need additional
 * data during invitation acceptance.
 *
 * Runtime validation is performed using the DTOs configured in your module options.
 * TypeScript compile-time validation is intentionally loose to support extensibility.
 *
 * **SECURITY NOTES:**
 * - Role assignment is NOT controlled via this payload. The role must be set at invitation
 *   creation time via invitation.constraints.roleId (admin-controlled). Any roleId passed
 *   in this payload will be ignored.
 * - Only password and userMetadata are accepted by the default listener. User fields
 *   (active, email, username, etc.) cannot be updated via this endpoint to prevent
 *   mass assignment attacks.
 * - firstName and lastName should be included in userMetadata.
 * - userMetadata is validated using the DTO configured in userCrud.userMetadataConfig.updateDto
 *   if available, otherwise basic validation is applied.
 *
 * @example
 * ```typescript
 * // Basic usage with SDK-provided fields
 * const acceptanceData: InvitationAcceptanceDataInterface = {
 *   password: 'SecurePassword123!',
 *   userMetadata: {
 *     firstName: 'John',
 *     lastName: 'Doe',
 *   },
 * };
 * ```
 *
 * @example
 * ```typescript
 * // For stricter typing in your application, create your own interface:
 * interface MyAcceptanceData {
 *   password: string; // Required in your app
 *   userMetadata: {
 *     firstName: string;
 *     lastName: string;
 *     phoneNumber?: string;
 *   };
 * }
 * ```
 */
export interface InvitationAcceptanceDataInterface extends LiteralObject {
  /**
   * User password to set during invitation acceptance.
   * Will be hashed before storage using the configured password service.
   */
  password?: string;

  /**
   * User metadata to create or update during invitation acceptance.
   *
   * This is validated at runtime using the DTO configured in
   * `userCrud.userMetadataConfig.updateDto` if available.
   *
   * Common fields include firstName, lastName, bio, phoneNumber, etc.
   * The exact fields depend on your application's user metadata schema.
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
