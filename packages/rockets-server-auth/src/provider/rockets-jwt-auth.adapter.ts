import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ValidateAndVerifyAccessTokenQuery } from '@concepta/nestjs-authentication';
import { UserInterface } from '@concepta/nestjs-user';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetUserBySubjectQuery } from '@concepta/nestjs-user';
import { userAggregateToEntity } from '../shared/utils/aggregate-mappers';
import {
  resolveUserRoles,
  UserRolesView,
} from '../shared/utils/resolve-user-role-names';

@Injectable()
export class RocketsJwtAuthAdapter {
  private readonly logger = new Logger(RocketsJwtAuthAdapter.name);

  constructor(private readonly queryBus: QueryBus) {}

  async validateToken(token: string): Promise<{
    id: string;
    sub: string;
    email: string;
    userRoles: UserRolesView['userRoles'];
    claims: Record<string, unknown>;
  }> {
    try {
      // v8: signature-verify + payload-validate is one query handler now,
      // wired internally by AuthenticationModule. The v7 `VerifyTokenService`
      // is gone.
      const payload = (await this.queryBus.execute(
        new ValidateAndVerifyAccessTokenQuery({}, token),
      )) as { sub?: string; roles?: string[] };

      if (!payload?.sub) {
        this.logger.warn('Invalid token payload - missing sub claim');
        throw new UnauthorizedException('Invalid token payload');
      }

      const userResult = await this.queryBus.execute<
        GetUserBySubjectQuery,
        DomainAggregate<UserInterface> | null
      >(new GetUserBySubjectQuery({}, payload.sub));

      if (!userResult) {
        this.logger.warn(`User not found for subject: ${payload.sub}`);
        throw new UnauthorizedException('User not found');
      }

      const user = userAggregateToEntity(userResult);
      const userRoles = await resolveUserRoles(this.queryBus, user.id);

      this.logger.log(`Successfully validated token for user: ${payload.sub}`);

      return {
        id: user.id,
        sub: payload.sub,
        email: user.email,
        userRoles,
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
