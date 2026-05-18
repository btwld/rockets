/**
 * Invitation Domain
 *
 * Provides invitation functionality for rockets-server-auth.
 * Reuses `@concepta/nestjs-invitation` v8 module with custom CQRS listener
 * and factory-built controllers (Phase 4 — 2026-04-29).
 */

// DTOs
export { RocketsAuthInvitationDto } from './infrastructure/dto/rockets-auth-invitation.dto';
export { RocketsAuthInvitationCreateDto } from './infrastructure/dto/rockets-auth-invitation-create.dto';
export { RocketsAuthInvitationAcceptDto } from './infrastructure/dto/rockets-auth-invitation-accept.dto';
export { RocketsAuthInvitationRevokeDto } from './infrastructure/dto/rockets-auth-invitation-revoke.dto';
export { RocketsAuthInvitationResponseDto } from './infrastructure/dto/rockets-auth-invitation-response.dto';

// Interfaces
export {
  InvitationAcceptanceDataInterface,
  TypedInvitationAcceptedEventPayloadInterface,
} from './interfaces/invitation-acceptance-data.interface';

export type {
  InvitationDomainControllerExtras,
  InvitationControllerExtras,
  InvitationAcceptanceControllerExtras,
  InvitationRevocationControllerExtras,
  InvitationReattemptControllerExtras,
  InvitationRouteExtras,
} from './interfaces/invitation-controller-extras.interface';

// Gateway controller factories
export {
  buildInvitationController,
  buildInvitationAcceptanceController,
  buildInvitationRevocationController,
  buildInvitationReattemptController,
} from './gateways/http/factories/build-invitation-controllers';

// Modules
export {
  RocketsAuthInvitationAcceptanceModule,
  INVITATION_ACCEPTANCE_LISTENER_TOKEN,
  type InvitationAcceptedEventHandler,
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
} from './domain/exceptions/invitation.exception';
