import { RocketsAuthUserUpdateDto } from '@bitwild/rockets-auth';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UserMetadataDto } from './user-metadata.dto';

/**
 * User Update DTO
 * 
 * Extends RocketsAuthUserUpdateDto with userMetadata field
 * to support updating users with metadata.
 */
export class UserUpdateDto extends RocketsAuthUserUpdateDto {
    @ApiProperty({ type: UserMetadataDto, required: false, description: 'User metadata' })
    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => UserMetadataDto)
    declare userMetadata?: UserMetadataDto;
}