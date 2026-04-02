import {
  Injectable,
  Inject,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { VerifyTokenService } from '@concepta/nestjs-authentication';
import {
  UserEntityInterface,
  RoleEntityInterface,
} from '@concepta/nestjs-common';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetAssignedRolesQuery, RoleAssignment } from '@concepta/nestjs-role';
import { GetUserBySubjectQuery } from '@concepta/nestjs-user';
import { RocketsEntity } from '../shared/constants/repository-entity-keys.constants';
import { createRepositoryContext } from '../shared/utils/repository-context.helper';
import { RocketsGetRolesByIdsQuery } from '../domains/role/application/queries/impl/rockets-get-roles-by-ids.query';

@Injectable()
export class RocketsJwtAuthProvider {
  private readonly logger = new Logger(RocketsJwtAuthProvider.name);

  constructor(
    @Inject(VerifyTokenService)
    private readonly verifyTokenService: VerifyTokenService,
    private readonly queryBus: QueryBus,
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

      const userCtx = createRepositoryContext(RocketsEntity.user);
      const userResult = await this.queryBus.execute<
        GetUserBySubjectQuery,
        DomainAggregate<UserEntityInterface> | null
      >(new GetUserBySubjectQuery(userCtx, payload.sub));

      if (!userResult) {
        this.logger.warn(`User not found for subject: ${payload.sub}`);
        throw new UnauthorizedException('User not found');
      }

      const user = userResult.toPlain() as UserEntityInterface;

      const roleCtx = createRepositoryContext(RocketsEntity.userRole);
      const assignedRoleAssignments = await this.queryBus.execute<
        GetAssignedRolesQuery,
        RoleAssignment[]
      >(new GetAssignedRolesQuery(roleCtx, user.id));

      let roleNames: string[] = [];
      if (assignedRoleAssignments?.length > 0) {
        const roleIds = assignedRoleAssignments.map((ra) => ra.roleId);
        const roles = await this.queryBus.execute<
          RocketsGetRolesByIdsQuery,
          RoleEntityInterface[]
        >(new RocketsGetRolesByIdsQuery(roleIds));
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
