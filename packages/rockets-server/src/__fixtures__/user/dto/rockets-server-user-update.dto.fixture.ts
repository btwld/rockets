import { PickType } from '@nestjs/swagger';
import { RocketsServerUserUpdatableInterface } from '../../../interfaces/user/rockets-server-user-updatable.interface';
import { RocketsServerUserDtoFixture } from './rockets-server-user.dto.fixture';

/**
 * Test-specific DTO with age validation for user update tests
 *
 * This DTO includes age validation for testing purposes across e2e tests
 * without affecting the main project DTOs
 */
export class RocketsServerUserUpdateDtoFixture
  extends PickType(RocketsServerUserDtoFixture, [
    'id',
    'username',
    'email',
    'firstName',
    'active',
    'age',
  ] as const)
  implements RocketsServerUserUpdatableInterface {}
