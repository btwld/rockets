import { RocketsAuthUserUpdateDto } from '@bitwild/rockets-auth';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UserMetadataDto } from './user-metadata.dto';

/**
 * User Update DTO
 * 
 * Extends RocketsAuthUserUpdateDto with custom userMetadata field.
 * Overrides the base userMetadata to use project-specific UserMetadataDto.
 */
export class SampleUserUpdateDto extends RocketsAuthUserUpdateDto {
    @ApiPropertyOptional({ type: UserMetadataDto, description: 'User metadata' })
    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => UserMetadataDto)
    userMetadata?: UserMetadataDto;
}
