import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { ClearOtpsCommand } from '@concepta/nestjs-otp';
import { createRepositoryContext } from '../../../../../shared/utils/repository-context.helper';
import { RocketsClearOtpsCommand } from '../impl/rockets-clear-otps.command';

@CommandHandler(RocketsClearOtpsCommand)
export class RocketsClearOtpsHandler
  implements ICommandHandler<RocketsClearOtpsCommand, void>
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: RocketsClearOtpsCommand): Promise<void> {
    const ctx = createRepositoryContext(String(command.assignment));
    await this.commandBus.execute(
      new ClearOtpsCommand(ctx, {
        category: command.otp.category,
        assigneeId: command.otp.assigneeId,
      }),
    );
  }
}
