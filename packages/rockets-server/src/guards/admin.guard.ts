import { RoleModelService, RoleService } from '@concepta/nestjs-role';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { RocketsServerSettingsInterface } from '../interfaces/rockets-server-settings.interface';
import { ROCKETS_SERVER_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../rockets-server.constants';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(ROCKETS_SERVER_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsServerSettingsInterface,
    @Inject(RoleModelService)
    private readonly roleModelService: RoleModelService,
    @Inject(RoleService)
    private readonly roleService: RoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const AdminRole = this.settings.role.adminRoleName;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    try {
      const roles = await this.roleModelService.find({
        where: {
          name: AdminRole,
        },
      });

      if (roles && roles.length > 0) {
        const admin = roles[0];
        const isAdmin = await this.roleService.isAssignedRole({
          assignment: 'user',
          assignee: { id: user.id },
          role: { id: admin.id },
        });
        return isAdmin;
      } else throw new ForbiddenException();
    } catch (error) {
      // If there's an error checking roles (e.g., role doesn't exist), deny access
      if (error instanceof ForbiddenException) {
        throw error;
      }

      throw new ForbiddenException();
    }
  }
}
