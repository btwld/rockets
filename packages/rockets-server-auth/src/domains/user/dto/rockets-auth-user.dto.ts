import { UserDto } from '@concepta/nestjs-user';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { RocketsAuthUserInterface } from '../interfaces/rockets-auth-user.interface';
import { RocketsAuthUserMetadataDto } from './rockets-auth-user-metadata.dto';

/**
 * Rockets Auth User DTO
 *
 * Extends the base user DTO from the user module.
 * Includes userMetadata with proper Swagger decorators.
 *
 * Note: When extending this DTO and overriding userMetadata,
 * do NOT use 'declare' - redefine the property with your own decorators.
 */
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
