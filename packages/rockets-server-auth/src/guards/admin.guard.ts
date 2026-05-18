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
import { QueryBus } from '@nestjs/cqrs';
import { RoleEntityInterface } from '@concepta/nestjs-role';
import { IsAssignedRoleQuery } from '@concepta/nestjs-role';
import { RocketsAuthSettingsInterface } from '../shared/interfaces/rockets-auth-settings.interface';
import { RocketsEntity } from '../shared/constants/repository-entity-keys.constants';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../shared/constants/rockets-auth.constants';
import { logAndGetErrorDetails } from '../shared/utils/error-logging.helper';
import { RocketsGetRoleByNameQuery } from '../domains/role/application/queries/impl/rockets-get-role-by-name.query';

@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);

  constructor(
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
    private readonly queryBus: QueryBus,
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
      const role = await this.queryBus.execute<
        RocketsGetRoleByNameQuery,
        RoleEntityInterface | null
      >(new RocketsGetRoleByNameQuery(ADMIN_ROLE));

      if (!role) {
        throw new ForbiddenException();
      }

      return await this.queryBus.execute<IsAssignedRoleQuery, boolean>(
        new IsAssignedRoleQuery({}, RocketsEntity.userRole, role.id, user.id),
      );
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }

      logAndGetErrorDetails(
        error,
        this.logger,
        'Error checking admin role for user',
        { userId: user.id, errorId: 'ADMIN_CHECK_FAILED' },
      );

      throw new ServiceUnavailableException('Unable to verify admin access');
    }
  }
}
