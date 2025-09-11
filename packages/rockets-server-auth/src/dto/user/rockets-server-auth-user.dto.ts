import { UserDto } from '@concepta/nestjs-user';
import { RocketsServerAuthUserInterface } from '../../interfaces/user/rockets-server-auth-user.interface';

/**
 * Rockets Server User DTO
 *
 * Extends the base user DTO from the user module
 */
export class RocketsServerAuthUserDto
  extends UserDto
  implements RocketsServerAuthUserInterface {}
