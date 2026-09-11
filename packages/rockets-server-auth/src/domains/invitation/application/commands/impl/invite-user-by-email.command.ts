import type { PlainLiteralObject } from '@nestjs/common';
import { Command } from '@nestjs/cqrs';
import type { Invitation } from '@concepta/nestjs-invitation';
import type { z } from 'zod';

import type { rocketsAuthInvitationCreateSchema } from '../../../infrastructure/schemas/rockets-auth-invitation-create.schema';

export type RocketsInviteUserByEmailInput = z.output<
  typeof rocketsAuthInvitationCreateSchema
>;

/**
 * Invite an address: the invited account is created inactive when it does
 * not exist yet, then the upstream invitation is created for it (upstream
 * sends the invitation email from the transaction's commit hook).
 */
export class RocketsInviteUserByEmailCommand extends Command<Invitation> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly dto: RocketsInviteUserByEmailInput,
  ) {
    super();
  }
}
