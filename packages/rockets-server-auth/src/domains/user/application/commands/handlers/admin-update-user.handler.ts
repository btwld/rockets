import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CrudUpdateCommand } from '@concepta/nestjs-crud';
import type { CrudCommandInterface } from '@concepta/nestjs-crud/dist/application/commands/interfaces/crud-command.interface';

import { UpdateUserCommand } from '../impl/update-user.command';
import { AbstractAdminUserUpdateHandler } from './abstract-admin-user-update.handler';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';
import { RocketsAuthUserUpdatableInterface } from '../../../interfaces/rockets-auth-user-updatable.interface';

@Injectable()
export class AdminUpdateUserHandler extends AbstractAdminUserUpdateHandler {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  async execute(
    command: CrudCommandInterface<RocketsAuthUserEntityInterface>,
  ): Promise<RocketsAuthUserEntityInterface> {
    const { context, dto } = command as CrudUpdateCommand<
      RocketsAuthUserEntityInterface,
      RocketsAuthUserUpdatableInterface
    >;
    const id = context.params.id as string;

    return this.commandBus.execute(new UpdateUserCommand(context, id, dto));
  }
}
