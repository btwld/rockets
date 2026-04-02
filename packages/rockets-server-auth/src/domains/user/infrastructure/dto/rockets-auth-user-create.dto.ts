import { UserPasswordDto } from '@concepta/nestjs-user';
import { IntersectionType, PickType } from '@nestjs/swagger';

import { RocketsAuthUserDto } from './rockets-auth-user.dto';
import { RocketsAuthUserCreatableInterface } from '../../interfaces/rockets-auth-user-creatable.interface';

/**
 * Rockets Server User Create DTO
 *
 * Extends the base user create DTO from the user module.
 * Includes userMetadata for creating users with metadata.
 *
 * Note: When extending this DTO and overriding userMetadata,
 * do NOT use 'declare' - redefine the property with your own decorators.
 */
export class RocketsAuthUserCreateDto
  extends IntersectionType(
    PickType(RocketsAuthUserDto, [
      'email',
      'username',
      'active',
      'userMetadata',
    ] as const),
    UserPasswordDto,
  )
  implements RocketsAuthUserCreatableInterface {}
