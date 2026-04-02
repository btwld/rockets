import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';

import { AssignDefaultRoleCommand } from '../impl/assign-default-role.command';
import { RocketsAuthRoleService } from '../../../../role/services/rockets-auth-role.service';

@CommandHandler(AssignDefaultRoleCommand)
export class AssignDefaultRoleHandler
  implements ICommandHandler<AssignDefaultRoleCommand, boolean>
{
  private readonly logger = new Logger(AssignDefaultRoleHandler.name);

  constructor(private readonly roleService: RocketsAuthRoleService) {}

  async execute(command: AssignDefaultRoleCommand): Promise<boolean> {
    const { userId } = command;
    this.logger.debug(`Assigning default role to user ${userId}`);
    return this.roleService.assignDefaultRoleToUser(userId, true);
  }
}
