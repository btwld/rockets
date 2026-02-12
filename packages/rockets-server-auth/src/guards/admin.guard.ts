import { RoleModelService, RoleService } from '@concepta/nestjs-role';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { RocketsAuthSettingsInterface } from '../shared/interfaces/rockets-auth-settings.interface';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../shared/constants/rockets-auth.constants';
import { logAndGetErrorDetails } from '../shared/utils/error-logging.helper';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
    @Inject(RoleModelService)
    private readonly roleModelService: RoleModelService,
    @Inject(RoleService)
    private readonly roleService: RoleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const ADMIN_ROLE = this.settings.role.adminRoleName;

    if (!user) throw new UnauthorizedException('User not authenticated');

    if (!ADMIN_ROLE) {
      throw new ForbiddenException('Admin Role not defined');
    }

    try {
      const roles = await this.roleModelService.find({
        where: {
          name: ADMIN_ROLE,
        },
      });

      if (roles.length > 0) {
        const admin = roles[0];
        const isAdmin = await this.roleService.isAssignedRole({
          assignment: 'user',
          assignee: { id: user.id },
          role: { id: admin.id },
        });
        return isAdmin;
      } else throw new ForbiddenException();
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // Log the actual error for debugging
      logAndGetErrorDetails(
        error,
        this.logger,
        'Error checking admin role for user',
        { userId: user.id, errorId: 'ADMIN_CHECK_FAILED' },
      );

      // Return appropriate 5xx for infrastructure issues
      throw new ServiceUnavailableException('Unable to verify admin access');
    }
  }
}
