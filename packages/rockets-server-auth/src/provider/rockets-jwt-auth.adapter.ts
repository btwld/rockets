import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ValidateAndVerifyAccessTokenQuery } from '@concepta/nestjs-authentication';
import { UserInterface } from '@concepta/nestjs-user';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetUserBySubjectQuery } from '@concepta/nestjs-user';
import type {
  AuthAdapterInterface,
  AuthAttemptResult,
  AuthRequest,
  AuthorizedUser,
} from '@bitwild/rockets-core';
import { extractBearerToken } from '@bitwild/rockets-core';
import { userAggregateToEntity } from '../shared/utils/aggregate-mappers';
import { resolveUserRoles } from '../shared/utils/resolve-user-role-names';

@Injectable()
export class RocketsJwtAuthAdapter implements AuthAdapterInterface {
  private readonly logger = new Logger(RocketsJwtAuthAdapter.name);

  constructor(private readonly queryBus: QueryBus) {}

  async authenticate(request: AuthRequest): Promise<AuthAttemptResult> {
    const token = extractBearerToken(request);
    if (token === null) return { matched: false };

    try {
      const user = await this.validateToken(token);
      return { matched: true, user };
    } catch (error) {
      this.logger.error(`Token validation failed: ${error || 'Unknown error'}`);
      if (error instanceof UnauthorizedException) {
        return { matched: true, error };
      }
      return {
        matched: true,
        error: new UnauthorizedException('Authentication failed'),
      };
    }
  }

  private async validateToken(token: string): Promise<AuthorizedUser> {
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
  }
}
