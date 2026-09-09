import { invitationSchema } from '@concepta/nestjs-invitation';
import { withOpenApi } from '@concepta/rockets-core';

/**
 * Upstream invitation shape under a Rockets-owned component id, so apps
 * that document this package's routes see `RocketsAuthInvitationDto`
 * (the name the retired class DTO carried) rather than upstream's
 * `Invitation`.
 */
export const rocketsAuthInvitationSchema = withOpenApi(
  invitationSchema.extend({}),
  'RocketsAuthInvitationDto',
);
