import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { RocketsAuthRoleCreatableInterface, RocketsAuthRoleDto, RocketsAuthRoleUpdatableInterface } from '@bitwild/rockets-auth';

export class RoleDto extends RocketsAuthRoleDto { }

export class RoleUpdateDto
  extends PartialType(
    PickType(RocketsAuthRoleDto, ['id', 'name', 'description'] as const),
  )
  implements RocketsAuthRoleUpdatableInterface {
  id!: string;
}

export class RoleCreateDto
  extends PickType(RocketsAuthRoleDto, ['name', 'description'] as const)
  implements RocketsAuthRoleCreatableInterface {}