import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { UserEntityInterface } from '@concepta/nestjs-common';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { UpdateUserCommand as ConceptaUpdateUserCommand } from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';
import { createRepositoryContext } from '../../../../../shared/utils/repository-context.helper';
import { RocketsUpdateUserCommand } from '../impl/rockets-update-user.command';

@CommandHandler(RocketsUpdateUserCommand)
export class RocketsUpdateUserHandler
  implements
    ICommandHandler<
      RocketsUpdateUserCommand,
      DomainAggregate<UserEntityInterface> | null
    >
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(
    command: RocketsUpdateUserCommand,
  ): Promise<DomainAggregate<UserEntityInterface> | null> {
    const ctx = createRepositoryContext(RocketsEntity.user);
    return this.commandBus.execute(
      new ConceptaUpdateUserCommand(ctx, command.id, command.data),
    );
  }
}
