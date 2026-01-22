import { RocketsAuthUserDto, RocketsAuthUserMetadataDto } from '@bitwild/rockets-auth';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { UserMetadataDto } from './user-metadata.dto';

export class UserDto extends RocketsAuthUserDto {
    @ApiProperty({ type: UserMetadataDto, required: false, description: 'User metadata' })
    @Expose()
    @IsOptional()
    @ValidateNested()
    @Type(() => UserMetadataDto)
    declare userMetadata?: UserMetadataDto;
}