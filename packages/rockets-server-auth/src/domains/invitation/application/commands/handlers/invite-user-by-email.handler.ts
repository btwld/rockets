import {
  CommandBus,
  CommandHandler,
  ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import {
  CreateInvitationByEmailCommand,
  type Invitation,
} from '@concepta/nestjs-invitation';
import {
  CreateUserCommand,
  GetUserByEmailQuery,
  GetUserByUsernameQuery,
} from '@concepta/nestjs-user';
import { DuplicateUserException } from '../../../../user/domain/exceptions/user.exception';
import { TransactionScope } from '@concepta/rockets-core';

import { RocketsInviteUserByEmailCommand } from '../impl/invite-user-by-email.command';

/**
 * Upstream `CreateInvitationByEmailCommand` only resolves an existing user
 * (`InvitationUserUndefinedException` otherwise); Rockets invites new
 * addresses too, so the account is created inactive here — in the same
 * transaction scope as the invitation row — and activated by the acceptance
 * listener. Upstream's `create()` already issues the OTP and dispatches the
 * invitation email on commit; sending again would issue a second OTP that
 * deactivates the one the invitee received.
 */
@CommandHandler(RocketsInviteUserByEmailCommand)
export class RocketsInviteUserByEmailHandler
  implements ICommandHandler<RocketsInviteUserByEmailCommand, Invitation>
{
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly txScope: TransactionScope,
  ) {}

  async execute(command: RocketsInviteUserByEmailCommand): Promise<Invitation> {
    const { ctx, dto } = command;

    return this.txScope.run(ctx, async (txCtx) => {
      const existing = await this.queryBus.execute(
        new GetUserByEmailQuery(txCtx, dto.email),
      );
      if (!existing) {
        // The invited account takes the address as its username, so the
        // address has to be free on BOTH columns — signup checks the same
        // pair. Upstream's CreateUserCommand saves without a pre-check, so
        // without this a collision surfaces as a driver error (a 500),
        // which is the failure shape this whole command exists to remove.
        const usernameTaken = await this.queryBus.execute(
          new GetUserByUsernameQuery(txCtx, dto.email),
        );
        if (usernameTaken) {
          throw new DuplicateUserException();
        }
        await this.commandBus.execute(
          new CreateUserCommand(txCtx, {
            email: dto.email,
            username: dto.email,
            active: false,
          }),
        );
      }
      return this.commandBus.execute(
        new CreateInvitationByEmailCommand(txCtx, dto),
      );
    });
  }
}
