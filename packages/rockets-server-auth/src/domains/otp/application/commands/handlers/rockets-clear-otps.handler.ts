import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { ClearOtpsCommand } from '@concepta/nestjs-otp';
import { RocketsClearOtpsCommand } from '../impl/rockets-clear-otps.command';

@CommandHandler(RocketsClearOtpsCommand)
export class RocketsClearOtpsHandler
  implements ICommandHandler<RocketsClearOtpsCommand, void>
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: RocketsClearOtpsCommand): Promise<void> {
    const namespace = String(command.assignment);
    await this.commandBus.execute(
      new ClearOtpsCommand({}, namespace, {
        category: command.otp.category,
        assigneeId: command.otp.assigneeId,
      }),
    );
  }
}
