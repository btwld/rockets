import { AccessControlServiceInterface } from '@concepta/nestjs-access-control';
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';

/**
 * Access Control Service Implementation Fixture
 *
 * Implements AccessControlServiceInterface to provide user and role information
 * to the AccessControlGuard for permission checking.
 */
@Injectable()
export class ACServiceFixture implements AccessControlServiceInterface {
  private readonly logger = new Logger(ACServiceFixture.name);

  /**
   * Get the authenticated user from the execution context
   */
  async getUser<T>(context: ExecutionContext): Promise<T> {
    const request = context.switchToHttp().getRequest();
    return request.user as T;
  }

  /**
   * Get the roles of the authenticated user
   */
  async getUserRoles(context: ExecutionContext): Promise<string | string[]> {
    const request = context.switchToHttp().getRequest();
    const endpoint = `${request.method} ${request.url}`;

    this.logger.debug(`[AccessControl] Checking roles for: ${endpoint}`);

    const jwtUser = await this.getUser<{
      id: string;
      userRoles?: { role: { name: string } }[];
    }>(context);

    if (!jwtUser || !jwtUser.id) {
      this.logger.warn(
        `[AccessControl] User not authenticated for: ${endpoint}`,
      );
      throw new UnauthorizedException('User is not authenticated');
    }

    const roles = jwtUser.userRoles?.map((ur) => ur.role.name) || [];

    this.logger.debug(
      `[AccessControl] User ${jwtUser.id} has roles: ${JSON.stringify(roles)}`,
    );

    return roles;
  }
}
