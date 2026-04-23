import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthorizedUser } from '@bitwild/rockets';
import { UserRole } from '../auth/user.entity';

/**
 * Gates an endpoint on the authenticated user carrying the `admin` role.
 *
 * The global `AuthServerGuard` (registered by `RocketsModule`) runs first
 * and populates `request.user`. This guard assumes that invariant — a
 * missing user here means `@AuthPublic()` was mistakenly applied on top
 * of this guard, or the endpoint is unauthenticated by accident. We throw
 * 401 in that case rather than a misleading 403.
 *
 * Admin detection reads from `userRoles[].role.name`, the shape the
 * `SampleAuthProvider.validateToken()` returns. Keep this guard aligned
 * with the provider if the role wiring changes.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthorizedUser }>();
    const user = request.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    const roles = user.userRoles ?? [];
    const isAdmin = roles.some(
      (entry) => entry?.role?.name === UserRole.ADMIN,
    );
    if (!isAdmin) {
      throw new ForbiddenException('Admin role required');
    }
    return true;
  }
}
