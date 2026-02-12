import { InvitationAcceptInviteDto } from '../../../shared/compat/concepta-internals';

/**
 * Rockets Auth Invitation Accept DTO
 *
 * Extends the base invitation accept DTO from the invitation module.
 * Inherits passcode and payload fields from parent.
 */
export class RocketsAuthInvitationAcceptDto extends InvitationAcceptInviteDto {
  // Inherits all fields from InvitationAcceptInviteDto:
  // - passcode: string
  // - payload?: LiteralObject
}
