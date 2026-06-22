import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { UserInterface } from '@concepta/nestjs-user';
import { DomainAggregate } from '@concepta/nestjs-core/aggregate';
import { UpdateUserCommand } from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';

import { RocketsUpdateUserCommand } from '../impl/rockets-update-user.command';
import { createRepositoryContext } from '@bitwild/rockets-common';

@CommandHandler(RocketsUpdateUserCommand)
export class RocketsUpdateUserHandler
  implements
    ICommandHandler<
      RocketsUpdateUserCommand,
      DomainAggregate<UserInterface> | null
    >
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(
    command: RocketsUpdateUserCommand,
  ): Promise<DomainAggregate<UserInterface> | null> {
    const ctx = createRepositoryContext(RocketsEntity.user);
    return this.commandBus.execute(
      new UpdateUserCommand(ctx, command.id, command.data),
    );
  }
}
