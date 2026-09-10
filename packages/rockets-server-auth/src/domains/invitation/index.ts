/**
 * Invitation Domain
 *
 * Provides invitation functionality for rockets-server-auth.
 * Reuses `@concepta/nestjs-invitation` v8 module with custom CQRS listener
 * and factory-built controllers (Phase 4 — 2026-04-29).
 */

// Schemas
export { rocketsAuthInvitationSchema } from './infrastructure/schemas/rockets-auth-invitation.schema';
export { rocketsAuthInvitationCreateSchema } from './infrastructure/schemas/rockets-auth-invitation-create.schema';
export { rocketsAuthInvitationAcceptSchema } from './infrastructure/schemas/rockets-auth-invitation-accept.schema';
export { rocketsAuthInvitationResponseSchema } from './infrastructure/schemas/rockets-auth-invitation-response.schema';
export { rocketsAuthInvitationAcceptancePayloadSchema } from './infrastructure/schemas/rockets-auth-invitation-acceptance-payload.schema';
export { rocketsAuthInvitationRevokeSchema } from './infrastructure/schemas/rockets-auth-invitation-revoke.schema';

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
