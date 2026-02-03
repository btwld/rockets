import { PartialType, PickType } from '@nestjs/swagger';
import { RocketsAuthUserUpdatableInterface } from '../../../domains/user/interfaces/rockets-auth-user-updatable.interface';
import { RocketsAuthUserFixtureDto } from './rockets-auth-user.dto.fixture';

/**
 * Test-specific DTO for user update tests
 *
 * This DTO is used for testing purposes across e2e tests
 * without affecting the main project DTOs.
 *
 * Note: Properties like age, firstName, lastName should be in userMetadata.
 */
export class RocketsAuthUserUpdateDtoFixture
  extends PartialType(
    PickType(RocketsAuthUserFixtureDto, ['active', 'userMetadata'] as const),
  )
  implements RocketsAuthUserUpdatableInterface {}
