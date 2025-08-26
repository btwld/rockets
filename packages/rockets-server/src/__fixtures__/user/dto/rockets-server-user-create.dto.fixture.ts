import { UserPasswordDto } from '@concepta/nestjs-user';
import { IntersectionType, PickType } from '@nestjs/swagger';
import { RocketsServerUserCreatableInterface } from '../../../interfaces/user/rockets-server-user-creatable.interface';
import { RocketsServerUserDtoFixture } from './rockets-server-user.dto.fixture';

/**
 * Test-specific DTO with age validation for user create tests
 *
 * This DTO includes age validation for testing purposes across e2e tests
 * without affecting the main project DTOs
 */
export class RocketsServerUserCreateDtoFixture
  extends IntersectionType(
    PickType(RocketsServerUserDtoFixture, [
      'email',
      'username',
      'active',
      'age',
    ] as const),
    UserPasswordDto,
  )
  implements RocketsServerUserCreatableInterface {}
