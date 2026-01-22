import { RocketsAuthUserCreateDto } from '@bitwild/rockets-auth';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UserMetadataDto } from './user-metadata.dto';

/**
 * User Create DTO
 * 
 * Extends RocketsAuthUserCreateDto with userMetadata field
 * to support creating users with metadata.
 */
export class UserCreateDto extends RocketsAuthUserCreateDto {
    @ApiProperty({ type: UserMetadataDto, required: false, description: 'User metadata' })
    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => UserMetadataDto)
    declare userMetadata?: UserMetadataDto;
}