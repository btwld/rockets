import type { Type } from '@nestjs/common';
import type {
  CrudCommandBaseHandler,
  CrudQueryBaseHandler,
} from '@concepta/nestjs-crud';
import type {
  RocketsAuthControllerExtrasBase,
  RocketsAuthRouteExtrasBase,
} from '../../../shared/interfaces/controller/rockets-auth-controller-extras.interface';
import type { RocketsAuthRoleEntityInterface } from './rockets-auth-role-entity.interface';

/**
 * Extras for the admin role CRUD resource. Class and route decorators are
 * forwarded to the generated controller; each route can replace its handler
 * with a Nest provider class shaped like the upstream CRUD handler of that
 * route (query handler for list/read, command handler otherwise). The
 * upstream base classes are the exported form of those contracts —
 * matching is structural, extending them is optional.
 */
export interface AdminRoleResourceRouteExtras<THandler>
  extends RocketsAuthRouteExtrasBase {
  /** Replace the operation handler with a Nest provider class. */
  handler?: Type<THandler>;
}

export interface AdminRoleResourceRoutesMap {
  list?: AdminRoleResourceRouteExtras<
    CrudQueryBaseHandler<RocketsAuthRoleEntityInterface>
  >;
  read?: AdminRoleResourceRouteExtras<
    CrudQueryBaseHandler<RocketsAuthRoleEntityInterface>
  >;
  create?: AdminRoleResourceRouteExtras<
    CrudCommandBaseHandler<RocketsAuthRoleEntityInterface>
  >;
  update?: AdminRoleResourceRouteExtras<
    CrudCommandBaseHandler<RocketsAuthRoleEntityInterface>
  >;
  delete?: AdminRoleResourceRouteExtras<
    CrudCommandBaseHandler<RocketsAuthRoleEntityInterface>
  >;
}

export interface AdminRoleResourceExtras
  extends RocketsAuthControllerExtrasBase<AdminRoleResourceRoutesMap> {}

/**
 * Extras for the **admin/users/:userId/roles** hand-built controller. Routes
 * map to method names on the controller class.
 */
export interface AdminUserRolesRouteExtras extends RocketsAuthRouteExtrasBase {}

export interface AdminUserRolesRoutesMap {
  list?: AdminUserRolesRouteExtras;
  assign?: AdminUserRolesRouteExtras;
}

export interface AdminUserRolesControllerExtras
  extends RocketsAuthControllerExtrasBase<AdminUserRolesRoutesMap> {}

/** Aggregate of all role-related controller extras. */
export interface RoleControllerExtras {
  /** Extras for the admin/roles CRUD resource. */
  adminResource?: AdminRoleResourceExtras;
  /** Extras for the admin user-roles hand-built controller. */
  userRoles?: AdminUserRolesControllerExtras;
}
