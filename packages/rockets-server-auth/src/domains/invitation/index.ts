/**
 * Invitation Domain
 *
 * Provides invitation functionality for rockets-server-auth.
 * Reuses \@concepta/nestjs-invitation module with custom listener and controllers.
 */

// DTOs
export { RocketsAuthInvitationDto } from './dto/rockets-auth-invitation.dto';
export { RocketsAuthInvitationCreateDto } from './dto/rockets-auth-invitation-create.dto';
export { RocketsAuthInvitationAcceptDto } from './dto/rockets-auth-invitation-accept.dto';
export { RocketsAuthInvitationRevokeDto } from './dto/rockets-auth-invitation-revoke.dto';
export { RocketsAuthInvitationResponseDto } from './dto/rockets-auth-invitation-response.dto';

// Interfaces
export {
  InvitationAcceptanceDataInterface,
  TypedInvitationAcceptedEventPayloadInterface,
} from './interfaces/invitation-acceptance-data.interface';

// Controllers
export { InvitationController } from './controllers/invitation.controller';
export { InvitationAcceptanceController } from './controllers/invitation-acceptance.controller';
export { InvitationRevocationController } from './controllers/invitation-revocation.controller';
export { InvitationReattemptController } from './controllers/invitation-reattempt.controller';

// Modules
export {
  RocketsAuthInvitationAcceptanceModule,
  INVITATION_ACCEPTANCE_LISTENER_TOKEN,
} from './modules/rockets-auth-invitation-acceptance.module';

// Exceptions
export {
  RocketsAuthInvitationException,
  RocketsAuthInvitationNotFoundException,
  RocketsAuthInvitationExpiredException,
  RocketsAuthInvitationAlreadyAcceptedException,
  RocketsAuthInvitationInvalidCodeException,
  RocketsAuthInvitationInvalidPasscodeException,
  RocketsAuthInvitationRevokedException,
  RocketsAuthInvitationUnauthorizedException,
  RocketsAuthInvitationCreationFailedException,
  RocketsAuthInvitationSendFailedException,
  RocketsAuthInvitationNotAcceptedException,
} from './invitation.exception';
