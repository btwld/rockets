import { InvitationAcceptDto as InvitationAcceptInviteDto } from '@concepta/nestjs-invitation';

/**
 * Rockets Auth Invitation Accept DTO
 *
 * Extends the base invitation accept DTO from the invitation module.
 * Inherits passcode and payload fields from parent.
 */
export class RocketsAuthInvitationAcceptDto extends InvitationAcceptInviteDto {}
