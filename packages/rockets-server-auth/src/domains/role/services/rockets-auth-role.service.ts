import { Injectable, Inject, Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { RoleEntityInterface } from '@concepta/nestjs-common';
import { AssignRoleCommand } from '@concepta/nestjs-role';
import { RocketsEntity } from '../../../shared/constants/repository-entity-keys.constants';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../../../shared/constants/rockets-auth.constants';
import { RocketsAuthSettingsInterface } from '../../../shared/interfaces/rockets-auth-settings.interface';
import { createRepositoryContext } from '../../../shared/utils/repository-context.helper';
import { getErrorDetails } from '../../../shared/utils/error-logging.helper';
import { RocketsGetRoleByNameQuery } from '../application/queries/impl/rockets-get-role-by-name.query';

@Injectable()
export class RocketsAuthRoleService {
  private readonly logger = new Logger(RocketsAuthRoleService.name);

  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
  ) {}

  async assignDefaultRoleToUser(
    userId: string,
    throwOnError: boolean = false,
  ): Promise<boolean> {
    if (!this.settings.role.defaultUserRoleName) {
      this.logger.warn(
        'No default role configured in settings.role.defaultUserRoleName',
        { userId },
      );
      return false;
    }

    try {
      const defaultRole = await this.queryBus.execute<
        RocketsGetRoleByNameQuery,
        RoleEntityInterface | null
      >(new RocketsGetRoleByNameQuery(this.settings.role.defaultUserRoleName));

      if (defaultRole) {
        const ctx = createRepositoryContext(RocketsEntity.userRole);
        await this.commandBus.execute(
          new AssignRoleCommand(ctx, defaultRole.id, userId),
        );
        return true;
      }

      this.logger.warn(
        `Default role '${this.settings.role.defaultUserRoleName}' not found in database`,
        { userId },
      );
      return false;
    } catch (error) {
      const { errorMessage } = getErrorDetails(error);
      this.logger.error(`Failed to assign default role: ${errorMessage}`, {
        userId,
        error: errorMessage,
      });

      if (throwOnError) {
        throw error;
      }

      return false;
    }
  }
}
