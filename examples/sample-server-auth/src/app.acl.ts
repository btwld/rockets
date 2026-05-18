import { AccessControl } from 'accesscontrol';

/**
 * Application roles enum
 * Defines all possible roles in the system
 */
export enum AppRole {
  Admin = 'admin',
  Manager = 'manager',
  User = 'user',
}

/**
 * Application resources enum
 * Defines all resources that can be access-controlled
 */
export enum AppResource {
  Pet = 'pet',
  PetVaccination = 'pet-vaccination',
  PetAppointment = 'pet-appointment',
}

const allResources = Object.values(AppResource);

/**
 * Access Control Rules
 * Uses the accesscontrol library to define role-based permissions
 *
 * Pattern:
 * - .grant(role) - Grant permissions to a role
 * - .resource(resource) - Specify the resource
 * - .create() / .read() / .update() / .delete() - Specify actions
 *
 * @see https://www.npmjs.com/package/accesscontrol
 */
export const acRules: AccessControl = new AccessControl();

// Admin role has full access to all resources
acRules
  .grant([AppRole.Admin])
  .resource(allResources)
  .createAny()
  .readAny()
  .updateAny()
  .deleteAny();

// Manager role can create, read, and update but CANNOT delete
// This applies to pets, vaccinations, and appointments
acRules
  .grant([AppRole.Manager])
  .resource(allResources)
  .createAny()
  .readAny()
  .updateAny();

// User role - can only access their own resources (ownership-based)
// The PetAccessQueryService will verify ownership
acRules
  .grant([AppRole.User])
  .resource(allResources)
  .createOwn()
  .readOwn()
  .updateOwn()
  .deleteOwn();
