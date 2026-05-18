import { Type } from '@nestjs/common';
import {
  RocketsAuthControllerExtrasBase,
  RocketsAuthRouteExtrasBase,
} from '../../../shared/interfaces/controller/rockets-auth-controller-extras.interface';

/**
 * Extras for the **admin/roles** declarative CRUD controller. Forwarded into
 * `CrudModule.forFeature` as additional `controller.extraDecorators` and
 * `controller.useHooks`. Per-operation decorators / handler overrides are
 * applied per `Operation` key.
 */
export interface AdminRoleResourceRouteExtras
  extends RocketsAuthRouteExtrasBase {
  /**
   * Replace the CommandHandler for this operation. Must be a Type<unknown>
   * registered as a Nest provider — the resource builder resolves it from
   * the DI container.
   */
  handler?: Type<unknown>;
}

export interface AdminRoleResourceRoutesMap {
  list?: AdminRoleResourceRouteExtras;
  read?: AdminRoleResourceRouteExtras;
  create?: AdminRoleResourceRouteExtras;
  update?: AdminRoleResourceRouteExtras;
  delete?: AdminRoleResourceRouteExtras;
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
