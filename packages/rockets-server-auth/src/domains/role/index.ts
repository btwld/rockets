// Role Domain Public API
//
// Phase 2 (2026-04-29): removed v7 `RoleRepositoryCrudAdapter`. Admin role
// CRUD now resolves the repository via the dynamic-repository token by way
// of `CrudModule.forFeature` + the `entity` key. Hand-built admin user-roles
// controller is factory-built (see `gateways/http/factories/`).

// Gateway controller factory
export { buildAdminUserRolesController } from './gateways/http/factories/build-admin-user-roles-controller';

// Module
export { RocketsAuthRoleAdminModule } from './modules/rockets-auth-role-admin.module';

// Application — Queries
export { RocketsGetRoleByNameQuery } from './application/queries/impl/rockets-get-role-by-name.query';
export { RocketsGetRolesByIdsQuery } from './application/queries/impl/rockets-get-roles-by-ids.query';

// Application — Query handlers (default + abstract for overrides)
export { RocketsGetRoleByNameHandler } from './application/queries/handlers/rockets-get-role-by-name.handler';
export { AbstractRocketsGetRoleByNameHandler } from './application/queries/handlers/abstract-rockets-get-role-by-name.handler';
export { RocketsGetRolesByIdsHandler } from './application/queries/handlers/rockets-get-roles-by-ids.handler';
export { AbstractRocketsGetRolesByIdsHandler } from './application/queries/handlers/abstract-rockets-get-roles-by-ids.handler';

// Interfaces
export { RocketsAuthRoleInterface } from './interfaces/rockets-auth-role.interface';
export { RocketsAuthRoleEntityInterface } from './interfaces/rockets-auth-role-entity.interface';
export { RocketsAuthRoleCreatableInterface } from './interfaces/rockets-auth-role-creatable.interface';
export { RocketsAuthRoleUpdatableInterface } from './interfaces/rockets-auth-role-updatable.interface';

// Public controller-extras interfaces
export type {
  AdminRoleResourceExtras,
  AdminRoleResourceRouteExtras,
  AdminRoleResourceRoutesMap,
  AdminUserRolesControllerExtras,
  AdminUserRolesRouteExtras,
  AdminUserRolesRoutesMap,
  RoleControllerExtras,
} from './interfaces/role-controller-extras.interface';

// DTOs
export { RocketsAuthRoleDto } from './infrastructure/dto/rockets-auth-role.dto';
export { RocketsAuthRoleCreateDto } from './infrastructure/dto/rockets-auth-role-create.dto';
export { RocketsAuthRoleUpdateDto } from './infrastructure/dto/rockets-auth-role-update.dto';
