import { UserPasswordDto } from '@concepta/nestjs-user';
import { IntersectionType, PickType } from '@nestjs/swagger';
import { RocketsServerAuthUserCreatableInterface } from '../../../interfaces/user/rockets-server-auth-user-creatable.interface';
import { RocketsServerAuthUserDtoFixture } from './rockets-server-auth-user.dto.fixture';

/**
 * Test-specific DTO with age validation for user create tests
 *
 * This DTO includes age validation for testing purposes across e2e tests
 * without affecting the main project DTOs
 */
export class RocketsServerAuthUserCreateDtoFixture
  extends IntersectionType(
    PickType(RocketsServerAuthUserDtoFixture, [
      'email',
      'username',
      'active',
      'age',
    ] as const),
    UserPasswordDto,
  )
  implements RocketsServerAuthUserCreatableInterface {}
