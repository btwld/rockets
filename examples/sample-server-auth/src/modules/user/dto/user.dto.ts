import { RocketsAuthUserDto } from '@bitwild/rockets-auth';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UserMetadataDto } from './user-metadata.dto';

/**
 * User DTO
 * 
 * Extends RocketsAuthUserDto with custom userMetadata field.
 * Overrides the base userMetadata to use project-specific UserMetadataDto.
 */
export class UserDto extends RocketsAuthUserDto {
    @ApiPropertyOptional({ type: UserMetadataDto, description: 'User metadata' })
    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => UserMetadataDto)
    userMetadata?: UserMetadataDto = undefined;
}