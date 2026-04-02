import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RemoveUserCommand as UpstreamRemoveUserCommand } from '@concepta/nestjs-user';

import { RemoveUserCommand } from '../impl/remove-user.command';

@CommandHandler(RemoveUserCommand)
export class RemoveUserHandler implements ICommandHandler<RemoveUserCommand> {
  constructor(private readonly commandBus: CommandBus) {}

  async execute(command: RemoveUserCommand): Promise<void> {
    const { ctx, id } = command;

    await this.commandBus.execute(new UpstreamRemoveUserCommand(ctx, id));
  }
}
