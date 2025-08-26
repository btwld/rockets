import { UserPasswordDto } from '@concepta/nestjs-user';
import { IntersectionType, PickType } from '@nestjs/swagger';
import { RocketsServerUserCreatableInterface } from '../../interfaces/user/rockets-server-user-creatable.interface';
import { RocketsServerUserDto } from './rockets-server-user.dto';

/**
 * Rockets Server User Create DTO
 *
 * Extends the base user create DTO from the user module
 */
export class RocketsServerUserCreateDto
  extends IntersectionType(
    PickType(RocketsServerUserDto, ['email', 'username', 'active'] as const),
    UserPasswordDto,
  )
  implements RocketsServerUserCreatableInterface {}
