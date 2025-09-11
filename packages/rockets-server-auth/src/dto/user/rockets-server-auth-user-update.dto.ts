import { IntersectionType, PartialType, PickType } from '@nestjs/swagger';
import { RocketsServerAuthUserUpdatableInterface } from '../../interfaces/user/rockets-server-auth-user-updatable.interface';
import { RocketsServerAuthUserDto } from './rockets-server-auth-user.dto';

/**
 * Rockets Server User Update DTO
 *
 * Extends the base user update DTO from the user module
 */
export class RocketsServerAuthUserUpdateDto
  extends IntersectionType(
    PickType(RocketsServerAuthUserDto, ['id'] as const),
    PartialType(
      PickType(RocketsServerAuthUserDto, [
        'id',
        'username',
        'email',
        'active',
      ] as const),
    ),
  )
  implements RocketsServerAuthUserUpdatableInterface {}
