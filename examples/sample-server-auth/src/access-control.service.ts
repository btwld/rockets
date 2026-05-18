import { AccessControlServiceInterface } from '@bitwild/rockets-access-control';
import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';

/**
 * Access Control Service Implementation
 *
 * Implements AccessControlServiceInterface to provide user and role information
 * to the AccessControlGuard for permission checking.
 *
 * This service extracts the authenticated user from the request and
 * returns their roles for access control evaluation. The roles are populated
 * by the authentication provider (RocketsJwtAuthAdapter) during token validation.
 *
 * Note: All users are expected to have at least one role assigned during signup.
 */
@Injectable()
export class ACService implements AccessControlServiceInterface {
  private readonly logger = new Logger(ACService.name);
  /**
   * Get the authenticated user from the execution context
   *
   * @param context - NestJS execution context
   * @returns The authenticated user object
   */
  async getUser<T>(context: ExecutionContext): Promise<T> {
    const request = context.switchToHttp().getRequest();
    return request.user as T;
  }

  /**
   * Get the roles of the authenticated user
   *
   * Returns roles from the authenticated user object which are populated
   * by the authentication provider (RocketsJwtAuthAdapter) during token validation.
   *
   * @param context - NestJS execution context
   * @returns Array of role names or a single role name
   * @throws UnauthorizedException if user is not authenticated
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

    // Return roles from JWT user object (populated by RocketsJwtAuthAdapter)
    return roles;
  }
}
