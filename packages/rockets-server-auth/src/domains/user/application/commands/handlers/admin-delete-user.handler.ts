import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CrudDeleteCommand } from '@concepta/nestjs-crud';
import { RemoveUserCommand as UpstreamRemoveUserCommand } from '@concepta/nestjs-user';

import { AbstractAdminDeleteUserHandler } from './abstract-admin-delete-user.handler';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

@Injectable()
export class AdminDeleteUserHandler extends AbstractAdminDeleteUserHandler {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  async execute(
    command: CrudDeleteCommand<RocketsAuthUserEntityInterface>,
  ): Promise<RocketsAuthUserEntityInterface | null> {
    const { context } = command;
    const id = String(context.params.id);

    await this.commandBus.execute(new UpstreamRemoveUserCommand(context, id));

    return null;
  }
}
