import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CrudUpdateCommand } from '@bitwild/rockets-crud';

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
    command: CrudUpdateCommand<
      RocketsAuthUserEntityInterface,
      RocketsAuthUserUpdatableInterface
    >,
  ): Promise<RocketsAuthUserEntityInterface> {
    const { context, dto } = command;
    const id = String(context.params.id);

    return this.commandBus.execute(new UpdateUserCommand(context, id, dto));
  }
}
