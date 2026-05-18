import {
  CommandHandler,
  ICommandHandler,
  CommandBus,
  QueryBus,
} from '@nestjs/cqrs';
import { Inject, InternalServerErrorException, Logger } from '@nestjs/common';
import { AssignRoleCommand, RoleEntityInterface } from '@concepta/nestjs-role';

import { AssignDefaultRoleCommand } from '../impl/assign-default-role.command';
import { RocketsGetRoleByNameQuery } from '../../../../role/application/queries/impl/rockets-get-role-by-name.query';
import { RocketsEntity } from '../../../../../shared/constants/repository-entity-keys.constants';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../../../../../shared/constants/rockets-auth.constants';
import { RocketsAuthSettingsInterface } from '../../../../../shared/interfaces/rockets-auth-settings.interface';

@CommandHandler(AssignDefaultRoleCommand)
export class AssignDefaultRoleHandler
  implements ICommandHandler<AssignDefaultRoleCommand, boolean>
{
  private readonly logger = new Logger(AssignDefaultRoleHandler.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
  ) {}

  async execute(command: AssignDefaultRoleCommand): Promise<boolean> {
    const { userId } = command;
    const roleName = this.settings.role.defaultUserRoleName;

    // Valid scenario — app intentionally skips default-role assignment.
    if (!roleName) {
      this.logger.debug(
        `No default role configured; skipping assignment for user ${userId}`,
      );
      return false;
    }

    const role = await this.queryBus.execute<
      RocketsGetRoleByNameQuery,
      RoleEntityInterface | null
    >(new RocketsGetRoleByNameQuery(roleName));

    // Misconfiguration — role was named in settings but doesn't exist in DB.
    // Failing closed prevents users from being created without their expected
    // role (silent privilege downgrade).
    if (!role) {
      this.logger.error(
        `Default role '${roleName}' configured but not found in database; ` +
          `refusing to create user ${userId} without it.`,
      );
      throw new InternalServerErrorException(
        `Default user role '${roleName}' is configured in settings.role.` +
          `defaultUserRoleName but does not exist in the database. Seed the ` +
          `role before creating users, or remove the setting to disable ` +
          `default-role assignment.`,
      );
    }

    await this.commandBus.execute(
      new AssignRoleCommand({}, RocketsEntity.userRole, role.id, userId),
    );
    return true;
  }
}
