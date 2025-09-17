import { Exclude, Expose } from 'class-transformer';
import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, PickType, PartialType, IntersectionType } from '@nestjs/swagger';
import { 
  BaseProfileDto, 
  ProfileCreatableInterface, 
  ProfileModelUpdatableInterface 
} from '@bitwild/rockets-server';
import { ProfileEntity } from '../entities/profile.entity';

@Exclude()
export class ProfileDto extends BaseProfileDto {
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

export class ProfileCreateDto 
  extends PickType(ProfileDto, ['firstName', 'lastName', 'username', 'bio'] as const) 
  implements ProfileCreatableInterface {
  @ApiProperty({
    description: 'User ID',
    example: 'user-123',
  })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  // Add index signature to satisfy Record<string, unknown>
  [key: string]: unknown;
}

export class ProfileUpdateDto extends PartialType(PickType(ProfileDto, ['firstName', 'lastName', 'username', 'bio'] as const)) implements ProfileModelUpdatableInterface {
  @ApiProperty({
    description: 'Profile ID',
    example: 'profile-123',
  })
  @IsString()
  @IsNotEmpty()
  id!: string;
}
