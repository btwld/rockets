import { UserDto } from '@concepta/nestjs-user';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';

import { RocketsAuthUserMetadataDto } from './rockets-auth-user-metadata.dto';
import { RocketsAuthUserInterface } from '../../interfaces/rockets-auth-user.interface';

/**
 * Rockets Auth User DTO
 *
 * Extends the base user DTO from the user module.
 * Includes userMetadata with proper Swagger decorators.
 *
 * Note: When extending this DTO and overriding userMetadata,
 * do NOT use 'declare' - redefine the property with your own decorators.
 */
@Exclude()
export class RocketsAuthUserDto
  extends UserDto
  implements RocketsAuthUserInterface
{
  @ApiPropertyOptional({
    type: RocketsAuthUserMetadataDto,
    description: 'User metadata containing additional profile information',
  })
  @Expose()
  @IsOptional()
  @ValidateNested()
  @Type(() => RocketsAuthUserMetadataDto)
  userMetadata?: RocketsAuthUserMetadataDto;
}
