import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { OtpInterface } from '@concepta/nestjs-common';
import { CreateOtpCommand } from '@concepta/nestjs-otp';
import { createRepositoryContext } from '../../../../../shared/utils/repository-context.helper';
import { RocketsCreateOtpCommand } from '../impl/rockets-create-otp.command';

@CommandHandler(RocketsCreateOtpCommand)
export class RocketsCreateOtpHandler
  implements ICommandHandler<RocketsCreateOtpCommand, OtpInterface>
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: RocketsCreateOtpCommand): Promise<OtpInterface> {
    const { assignment, otp } = command.params;
    const ctx = createRepositoryContext(String(assignment));
    return this.commandBus.execute(
      new CreateOtpCommand(ctx, {
        category: otp.category,
        type: otp.type,
        assigneeId: otp.assigneeId,
        expiresIn: otp.expiresIn,
      }),
    );
  }
}
