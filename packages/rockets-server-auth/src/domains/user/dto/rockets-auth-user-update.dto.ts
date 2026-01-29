import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { RocketsAuthUserUpdatableInterface } from '../interfaces/rockets-auth-user-updatable.interface';
import { RocketsAuthUserDto } from './rockets-auth-user.dto';

/**
 * Rockets Server User Update DTO
 *
 * Extends the base user update DTO from the user module.
 * Includes userMetadata for updating users with metadata.
 *
 * Note: When extending this DTO and overriding userMetadata,
 * do NOT use 'declare' - redefine the property with your own decorators.
 */
export class RocketsAuthUserUpdateDto
  extends IntersectionType(
    PickType(RocketsAuthUserDto, ['id'] as const),
    PartialType(
      PickType(RocketsAuthUserDto, [
        'id',
        'username',
        'email',
        'active',
        'userMetadata',
      ] as const),
    ),
  )
  implements RocketsAuthUserUpdatableInterface {}
