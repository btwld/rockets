import { RocketsAuthUserMetadataDto } from '@bitwild/rockets-auth';
import { ApiProperty, PartialType, PickType } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

@Exclude()
export class UserMetadataDto extends RocketsAuthUserMetadataDto {
  @Expose()
  @ApiProperty({
    description: 'User first name',
    example: 'John',
    maxLength: 100,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'First name must be at least 1 character' })
  @MaxLength(100, { message: 'First name cannot exceed 100 characters' })
  firstName?: string;

  @Expose()
  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    maxLength: 100,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Last name must be at least 1 character' })
  @MaxLength(100, { message: 'Last name cannot exceed 100 characters' })
  lastName?: string;

  @Expose()
  @ApiProperty({
    description: 'Username',
    example: 'johndoe',
    maxLength: 50,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(50, { message: 'Username cannot exceed 50 characters' })
  username?: string;

  @Expose()
  @ApiProperty({
    description: 'User bio',
    example: 'Software developer passionate about clean code',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Bio cannot exceed 500 characters' })
  bio?: string;
}

export class UserMetadataCreateDto 
  extends PickType(UserMetadataDto, ['userId', 'firstName', 'lastName', 'username', 'bio'] as const) {
  // Add index signature to satisfy Record<string, unknown>
  [key: string]: unknown;
}

export class UserMetadataUpdateDto extends UserMetadataDto {}
