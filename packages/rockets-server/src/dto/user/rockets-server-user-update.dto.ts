import { PickType } from '@nestjs/swagger';
import { RocketsServerUserUpdatableInterface } from '../../interfaces/user/rockets-server-user-updatable.interface';
import { RocketsServerUserDto } from './rockets-server-user.dto';

/**
 * Rockets Server User Update DTO
 *
 * Extends the base user update DTO from the user module
 */
export class RocketsServerUserUpdateDto
  extends PickType(RocketsServerUserDto, [
    'id',
    'username',
    'email',
    'active',
  ] as const)
  implements RocketsServerUserUpdatableInterface {}
