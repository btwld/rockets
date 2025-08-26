import { UserDto } from '@concepta/nestjs-user';
import { RocketsServerUserInterface } from '../../interfaces/user/rockets-server-user.interface';

/**
 * Rockets Server User DTO
 *
 * Extends the base user DTO from the user module
 */
export class RocketsServerUserDto
  extends UserDto
  implements RocketsServerUserInterface {}
