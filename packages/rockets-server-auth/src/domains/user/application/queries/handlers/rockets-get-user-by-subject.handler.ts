import { QueryBus, QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import type { AuthenticationUserResult } from '@concepta/nestjs-authentication';
import { DomainAggregate } from '@concepta/nestjs-common/aggregate';
import { GetUserBySubjectQuery, UserInterface } from '@concepta/nestjs-user';

import { resolveBitwildAppContext } from '../../../../../shared/compatibility/resolve-bitwild-app-context';
import { RocketsGetUserBySubjectQuery } from '../impl/rockets-get-user-by-subject.query';
import {
  resolveUserRoles,
  UserRolesView,
} from '../../../../../shared/utils/resolve-user-role-names';

/**
 * Augments `AuthenticationUserResult` with the role-name view and the JWT
 * subject claim — both fields consumers read off `request.user` (the latter
 * is used by `MeController` and any caller that needs the original `sub`).
 * Subtype of `AuthenticationUserResult`, so any caller typed to the
 * upstream shape keeps working.
 */
type AuthenticationUserWithRoles =
  | (NonNullable<AuthenticationUserResult> & UserRolesView & { sub: string })
  | null;

/**
 * User-port `getBySubject` handler for the upstream passport JWT strategy.
 * Why this handler exists (vs. the upstream default): `JwtStrategy.validate`
 * propagates whatever this returns to `request.user`. The default upstream
 * query only loads the user record — `userRoles` is the relation, not
 * eager. Resolving it here means every consumer of the upstream JwtGuard
 * sees the same enriched shape without repeating the role-fetch dance.
 */
@QueryHandler(RocketsGetUserBySubjectQuery)
export class RocketsGetUserBySubjectHandler
  implements
    IQueryHandler<RocketsGetUserBySubjectQuery, AuthenticationUserWithRoles>
{
  constructor(private readonly queryBus: QueryBus) {}

  async execute(
    query: RocketsGetUserBySubjectQuery,
  ): Promise<AuthenticationUserWithRoles> {
    const aggregate = await this.queryBus.execute<
      GetUserBySubjectQuery,
      DomainAggregate<UserInterface> | null
    >(
      new GetUserBySubjectQuery(
        resolveBitwildAppContext(query.ctx),
        String(query.subject),
      ),
    );

    if (!aggregate) {
      return null;
    }

    const plain = aggregate.toPlain();
    const userRoles = await resolveUserRoles(this.queryBus, plain.id);

    return {
      id: plain.id,
      sub: String(query.subject),
      email: plain.email,
      username: plain.username,
      active: plain.active,
      userRoles,
    };
  }
}
