import { Injectable, Inject } from '@nestjs/common';
import { RoleModelService, RoleService } from '@concepta/nestjs-role';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../../../shared/constants/rockets-auth.constants';
import { RocketsAuthSettingsInterface } from '../../../shared/interfaces/rockets-auth-settings.interface';
import { getErrorDetails } from '../../../shared/utils/error-logging.helper';

/**
 * Rockets Auth Role Service
 *
 * Provides shared role management functionality for rockets-server-auth,
 * including default role assignment for new users.
 */
@Injectable()
export class RocketsAuthRoleService {
  constructor(
    @Inject(RoleModelService)
    private readonly roleModelService: RoleModelService,
    @Inject(RoleService)
    private readonly roleService: RoleService,
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
  ) {}

  /**
   * Assigns the default role to a user
   *
   * Looks up the role configured in settings.role.defaultUserRoleName
   * and assigns it to the specified user if it exists.
   *
   * @param userId - The user ID to assign the role to
   * @param throwOnError - Whether to throw error or just log it (default: false)
   * @returns Promise<boolean> - true if role was assigned, false if failed or not configured
   */
  async assignDefaultRoleToUser(
    userId: string,
    throwOnError: boolean = false,
  ): Promise<boolean> {
    // Check if default role is configured
    if (!this.settings.role.defaultUserRoleName) {
      return false;
    }

    try {
      // Find the default role by name
      const defaultRoles = await this.roleModelService.find({
        where: { name: this.settings.role.defaultUserRoleName },
      });

      // Assign the role if it exists
      if (defaultRoles && defaultRoles.length > 0) {
        await this.roleService.assignRole({
          assignment: 'user',
          assignee: { id: userId },
          role: { id: defaultRoles[0].id },
        });
        return true;
      }

      return false;
    } catch (error) {
      // Always log the error for debugging
      const { errorMessage } = getErrorDetails(error);
      console.warn(`Failed to assign default role: ${errorMessage}`);

      // Throw if requested (for strict error handling contexts)
      if (throwOnError) {
        throw error;
      }

      return false;
    }
  }
}
