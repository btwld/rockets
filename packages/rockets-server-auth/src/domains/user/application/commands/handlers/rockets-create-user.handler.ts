import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { UserEntityInterface } from '@concepta/nestjs-common';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { CreateUserCommand as ConceptaCreateUserCommand } from '@concepta/nestjs-user';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';
import { createRepositoryContext } from '../../../../../shared/utils/repository-context.helper';
import { RocketsCreateUserCommand } from '../impl/rockets-create-user.command';

@CommandHandler(RocketsCreateUserCommand)
export class RocketsCreateUserHandler
  implements
    ICommandHandler<
      RocketsCreateUserCommand,
      DomainAggregate<UserEntityInterface> | null
    >
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(
    command: RocketsCreateUserCommand,
  ): Promise<DomainAggregate<UserEntityInterface> | null> {
    const ctx = createRepositoryContext(RocketsEntity.user);
    const dto = {
      username: command.data.username ?? command.data.email ?? '',
      email: command.data.email ?? '',
      active: command.data.active,
    };
    return this.commandBus.execute(new ConceptaCreateUserCommand(ctx, dto));
  }
}
