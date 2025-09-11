import { UserPasswordDto } from '@concepta/nestjs-user';
import { IntersectionType, PickType } from '@nestjs/swagger';
import { RocketsServerAuthUserCreatableInterface } from '../../interfaces/user/rockets-server-auth-user-creatable.interface';
import { RocketsServerAuthUserDto } from './rockets-server-auth-user.dto';

/**
 * Rockets Server User Create DTO
 *
 * Extends the base user create DTO from the user module
 */
export class RocketsServerAuthUserCreateDto
  extends IntersectionType(
    PickType(RocketsServerAuthUserDto, ['email', 'username', 'active'] as const),
    UserPasswordDto,
  )
  implements RocketsServerAuthUserCreatableInterface {}
