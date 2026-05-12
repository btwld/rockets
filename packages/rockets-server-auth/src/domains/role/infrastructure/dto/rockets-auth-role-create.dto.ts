import { PickType } from '@nestjs/swagger';
import { RocketsAuthRoleCreatableInterface } from '../../interfaces/rockets-auth-role-creatable.interface';
import { RocketsAuthRoleDto } from './rockets-auth-role.dto';

/**
 * Rockets Server Role Create DTO
 *
 * Extends the base role create DTO from the role module
 */
export class RocketsAuthRoleCreateDto
  extends PickType(RocketsAuthRoleDto, ['name', 'description'] as const)
  implements RocketsAuthRoleCreatableInterface {}
