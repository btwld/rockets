import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { CreateOtpCommand, OtpInterface } from '@concepta/nestjs-otp';
import { RocketsCreateOtpCommand } from '../impl/rockets-create-otp.command';

@CommandHandler(RocketsCreateOtpCommand)
export class RocketsCreateOtpHandler
  implements ICommandHandler<RocketsCreateOtpCommand, OtpInterface>
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: RocketsCreateOtpCommand): Promise<OtpInterface> {
    const { assignment, otp } = command.params;
    const namespace = String(assignment);
    return this.commandBus.execute(
      new CreateOtpCommand({}, namespace, {
        category: otp.category,
        type: otp.type,
        assigneeId: otp.assigneeId,
        expiresIn: otp.expiresIn,
      }),
    );
  }
}
