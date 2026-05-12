import { PartialType, PickType } from '@nestjs/swagger';
import { RocketsAuthRoleUpdatableInterface } from '../../interfaces/rockets-auth-role-updatable.interface';
import { RocketsAuthRoleDto } from './rockets-auth-role.dto';

/**
 * Rockets Server Role Update DTO
 *
 * Extends the base role update DTO from the role module
 */
export class RocketsAuthRoleUpdateDto
  extends PartialType(
    PickType(RocketsAuthRoleDto, ['name', 'description'] as const),
  )
  implements RocketsAuthRoleUpdatableInterface {}
