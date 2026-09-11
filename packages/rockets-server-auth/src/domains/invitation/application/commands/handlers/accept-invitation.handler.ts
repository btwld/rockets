import { Inject } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AcceptInvitationCommand,
  type Invitation,
} from '@concepta/nestjs-invitation';
import { TransactionScope } from '@concepta/rockets-core';

import { RocketsAcceptInvitationCommand } from '../impl/accept-invitation.command';
import {
  INVITATION_USER_ONBOARDING_SERVICE_TOKEN,
  type InvitationUserOnboardingServiceInterface,
} from '../../services/invitation-user-onboarding.service';

@CommandHandler(RocketsAcceptInvitationCommand)
export class RocketsAcceptInvitationHandler
  implements ICommandHandler<RocketsAcceptInvitationCommand, Invitation | null>
{
  constructor(
    private readonly commandBus: CommandBus,
    private readonly txScope: TransactionScope,
    @Inject(INVITATION_USER_ONBOARDING_SERVICE_TOKEN)
    private readonly onboarding: InvitationUserOnboardingServiceInterface,
  ) {}

  async execute(
    command: RocketsAcceptInvitationCommand,
  ): Promise<Invitation | null> {
    const { ctx, code, dto } = command;

    return this.txScope.run(ctx, async (txCtx) => {
      const invitation: Invitation | null = await this.commandBus.execute(
        new AcceptInvitationCommand(txCtx, code, dto),
      );
      if (!invitation) {
        return null;
      }

      await this.onboarding.onAccepted(
        txCtx,
        invitation.toPlain(),
        dto.payload,
      );

      return invitation;
    });
  }
}
