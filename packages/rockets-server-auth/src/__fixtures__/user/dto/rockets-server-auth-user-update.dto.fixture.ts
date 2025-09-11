import { PickType } from '@nestjs/swagger';
import { RocketsServerAuthUserUpdatableInterface } from '../../../interfaces/user/rockets-server-auth-user-updatable.interface';
import { RocketsServerAuthUserDtoFixture } from './rockets-server-auth-user.dto.fixture';

/**
 * Test-specific DTO with age validation for user update tests
 *
 * This DTO includes age validation for testing purposes across e2e tests
 * without affecting the main project DTOs
 */
export class RocketsServerAuthUserUpdateDtoFixture
  extends PickType(RocketsServerAuthUserDtoFixture, [
    'id',
    'username',
    'email',
    'firstName',
    'active',
    'age',
  ] as const)
  implements RocketsServerAuthUserUpdatableInterface {}
