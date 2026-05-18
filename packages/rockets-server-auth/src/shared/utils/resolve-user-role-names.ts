import { QueryBus } from '@nestjs/cqrs';
import {
  GetAssignedRolesQuery,
  RoleAssignment,
  RoleEntityInterface,
} from '@concepta/nestjs-role';

import { RocketsEntity } from '../constants/repository-entity-keys.constants';
import { RocketsGetRolesByIdsQuery } from '../../domains/role/application/queries/impl/rockets-get-roles-by-ids.query';

/**
 * The shape `AccessControlService` and other `request.user` readers expect
 * when looking for the authenticated user's roles. Kept here (not in the
 * upstream `AuthenticationUserResult`) so the field can be appended to any
 * user object without touching the upstream contract.
 */
export interface UserRolesView {
  userRoles: { role: { name: string } }[];
}

/**
 * Resolves role names for a user via the two-step CQRS dance:
 * `GetAssignedRolesQuery` (assignments → roleIds) then
 * `RocketsGetRolesByIdsQuery` (roleIds → names). Returns the result already
 * mapped into the `{ role: { name } }[]` shape consumers read.
 *
 * Shared between {@link RocketsGetUserBySubjectHandler} (passport user-port
 * path) and {@link RocketsJwtAuthAdapter} (auth-server-guard path) so the
 * mapping stays in lockstep — both paths must surface the same `userRoles`
 * shape on `request.user`.
 */
export async function resolveUserRoles(
  queryBus: QueryBus,
  userId: string,
): Promise<UserRolesView['userRoles']> {
  const assignments = await queryBus.execute<
    GetAssignedRolesQuery,
    RoleAssignment[]
  >(new GetAssignedRolesQuery({}, RocketsEntity.userRole, userId));

  if (!assignments?.length) {
    return [];
  }

  const roleIds = assignments.map((ra) => ra.roleId);
  const roles = await queryBus.execute<
    RocketsGetRolesByIdsQuery,
    RoleEntityInterface[]
  >(new RocketsGetRolesByIdsQuery(roleIds));

  return roles.map((role) => ({ role: { name: role.name } }));
}
