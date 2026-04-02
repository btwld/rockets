import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { RocketsAuthUserDto } from '../../../domains/user/infrastructure/dto/rockets-auth-user.dto';
import { RocketsAuthUserMetadataFixtureDto } from './rockets-auth-user-metadata.dto.fixture';

/**
 * Rockets Auth User DTO Fixture
 *
 * Extends RocketsAuthUserDto and uses the fixture metadata DTO
 * with implementation-specific fields for testing.
 *
 * Note: Extra properties like firstName, lastName, age, bio should be
 * placed in userMetadata, not directly on the user object.
 */
export class RocketsAuthUserFixtureDto extends RocketsAuthUserDto {
  @ApiPropertyOptional({
    type: RocketsAuthUserMetadataFixtureDto,
    description: 'User metadata',
  })
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => RocketsAuthUserMetadataFixtureDto)
  userMetadata?: RocketsAuthUserMetadataFixtureDto;
}
