import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CrudDeleteCommand } from '@concepta/nestjs-crud';
import type { CrudCommandInterface } from '@concepta/nestjs-crud/dist/application/commands/interfaces/crud-command.interface';
import { RemoveUserCommand as UpstreamRemoveUserCommand } from '@concepta/nestjs-user';

import { AbstractAdminDeleteUserHandler } from './abstract-admin-delete-user.handler';
import { RocketsAuthUserEntityInterface } from '../../../interfaces/rockets-auth-user-entity.interface';

@Injectable()
export class AdminDeleteUserHandler extends AbstractAdminDeleteUserHandler {
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  async execute(
    command: CrudCommandInterface<RocketsAuthUserEntityInterface>,
  ): Promise<RocketsAuthUserEntityInterface | null> {
    const { context } =
      command as CrudDeleteCommand<RocketsAuthUserEntityInterface>;
    const id = context.params.id as string;

    await this.commandBus.execute(new UpstreamRemoveUserCommand(context, id));

    return null;
  }
}
