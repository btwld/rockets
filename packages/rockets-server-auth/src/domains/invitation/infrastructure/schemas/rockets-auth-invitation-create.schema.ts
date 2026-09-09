import { invitationCreateByEmailSchema } from '@concepta/nestjs-invitation';
import { withOpenApi } from '@concepta/rockets-core';

/** `POST /admin/invitations` body — upstream shape, Rockets component id. */
export const rocketsAuthInvitationCreateSchema = withOpenApi(
  invitationCreateByEmailSchema.extend({}),
  'RocketsAuthInvitationCreateDto',
);
