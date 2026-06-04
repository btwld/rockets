import { CommandHandler, ICommandHandler, CommandBus } from '@nestjs/cqrs';
import { UserInterface } from '@concepta/nestjs-user';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { CreateUserCommand } from '@concepta/nestjs-user';
import { createRepositoryContext } from '@bitwild/rockets-app';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';
import { RocketsCreateUserCommand } from '../impl/rockets-create-user.command';

@CommandHandler(RocketsCreateUserCommand)
export class RocketsCreateUserHandler
  implements
    ICommandHandler<
      RocketsCreateUserCommand,
      DomainAggregate<UserInterface> | null
    >
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(
    command: RocketsCreateUserCommand,
  ): Promise<DomainAggregate<UserInterface> | null> {
    const ctx = createRepositoryContext(RocketsEntity.user);
    const dto = {
      username: command.data.username ?? command.data.email ?? '',
      email: command.data.email ?? '',
      active: command.data.active,
    };
    return this.commandBus.execute(new CreateUserCommand(ctx, dto));
  }
}
