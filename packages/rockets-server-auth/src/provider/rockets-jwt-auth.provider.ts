import {
  Injectable,
  Inject,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { VerifyTokenService } from '@concepta/nestjs-authentication';
import { UserModelService } from '@concepta/nestjs-user';
import { UserEntityInterface } from '@concepta/nestjs-common';
import { RoleService, RoleModelService } from '@concepta/nestjs-role';

@Injectable()
export class RocketsJwtAuthProvider {
  private readonly logger = new Logger(RocketsJwtAuthProvider.name);

  constructor(
    @Inject(VerifyTokenService)
    private readonly verifyTokenService: VerifyTokenService,
    @Inject(UserModelService)
    private readonly userModelService: UserModelService,
    @Inject(RoleService)
    private readonly roleService: RoleService,
    @Inject(RoleModelService)
    private readonly roleModelService: RoleModelService,
  ) {}

  async validateToken(token: string): Promise<{
    id: string;
    sub: string;
    email: string;
    userRoles: { role: { name: string } }[];
    claims: Record<string, unknown>;
  }> {
    try {
      const payload: { sub?: string; roles?: string[] } =
        await this.verifyTokenService.accessToken(token);

      if (!payload?.sub) {
        this.logger.warn('Invalid token payload - missing sub claim');
        throw new UnauthorizedException('Invalid token payload');
      }

      const user: UserEntityInterface | null =
        await this.userModelService.bySubject(payload.sub);

      if (!user) {
        this.logger.warn(`User not found for subject: ${payload.sub}`);
        throw new UnauthorizedException('User not found');
      }

      const assignedRoleIds = await this.roleService.getAssignedRoles({
        assignment: 'user',
        assignee: { id: user.id },
      });

      let roleNames: string[] = [];
      if (assignedRoleIds?.length > 0) {
        const roles = await this.roleModelService.find({
          where: assignedRoleIds.map((role) => ({ id: role.id })),
        });
        roleNames = roles.map((role) => role.name);
      }

      this.logger.log(`Successfully validated token for user: ${payload.sub}`);

      return {
        id: user.id,
        sub: payload.sub,
        email: user.email,
        userRoles: roleNames.map((name) => ({ role: { name } })),
        claims: { ...payload },
      };
    } catch (error) {
      this.logger.error(`Token validation failed: ${error || 'Unknown error'}`);

      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Token validation failed');
    }
  }
}
