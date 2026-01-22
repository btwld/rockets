import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { RocketsAuthRoleCreatableInterface, RocketsAuthRoleDto, RocketsAuthRoleUpdatableInterface } from '@bitwild/rockets-auth';

export class RoleDto extends RocketsAuthRoleDto { }

export class RoleUpdateDto
  extends IntersectionType(
    PickType(RocketsAuthRoleDto, ['id'] as const),
    PartialType(PickType(RocketsAuthRoleDto, ['name', 'description'] as const)),
  )
  implements RocketsAuthRoleUpdatableInterface { }

export class RoleCreateDto
  extends PickType(RocketsAuthRoleDto, ['name', 'description'] as const)
  implements RocketsAuthRoleCreatableInterface {}