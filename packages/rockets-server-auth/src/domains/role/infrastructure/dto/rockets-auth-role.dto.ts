import { RoleDto } from '@concepta/nestjs-role';
import { RocketsAuthRoleInterface } from '../../interfaces/rockets-auth-role.interface';

/**
 * Rockets Server Role DTO
 *
 * Extends the base role DTO from the role module
 */
export class RocketsAuthRoleDto
  extends RoleDto
  implements RocketsAuthRoleInterface {}
