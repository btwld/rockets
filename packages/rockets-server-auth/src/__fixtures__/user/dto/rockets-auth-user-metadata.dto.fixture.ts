import { Expose } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsNumber,
  Min,
} from 'class-validator';
import { RocketsAuthUserMetadataDto } from '../../../domains/user/dto/rockets-auth-user-metadata.dto';

/**
 * Rockets Auth User Metadata DTO Fixture
 *
 * Extends the base RocketsAuthUserMetadataDto with implementation-specific fields
 * for testing purposes. This demonstrates how implementations can add custom
 * metadata fields with validation.
 */
export class RocketsAuthUserMetadataFixtureDto extends RocketsAuthUserMetadataDto {
  @ApiPropertyOptional({
    description: 'First name',
    minLength: 1,
    maxLength: 100,
  })
  @Expose()
  @IsOptional()
  @IsString({ message: 'First name must be a string' })
  @MinLength(1, { message: 'First name must be at least 1 character' })
  @MaxLength(100, { message: 'First name must not exceed 100 characters' })
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name',
    minLength: 1,
    maxLength: 100,
    nullable: true,
  })
  @Expose()
  @IsOptional()
  @IsString({ message: 'Last name must be a string' })
  @MinLength(1, { message: 'Last name must be at least 1 character' })
  @MaxLength(100, { message: 'Last name must not exceed 100 characters' })
  lastName?: string | null;

  @ApiPropertyOptional({
    description: 'Username',
    minLength: 3,
    maxLength: 50,
  })
  @Expose()
  @IsOptional()
  @IsString({ message: 'Username must be a string' })
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(50, { message: 'Username must not exceed 50 characters' })
  username?: string;

  @ApiPropertyOptional({ description: 'Bio', maxLength: 500 })
  @Expose()
  @IsOptional()
  @IsString({ message: 'Bio must be a string' })
  @MaxLength(500, { message: 'Bio must not exceed 500 characters' })
  bio?: string;

  @ApiPropertyOptional({
    description: 'User age',
    minimum: 18,
    type: 'number',
  })
  @Expose()
  @IsOptional()
  @IsNumber({}, { message: 'Age must be a number' })
  @Min(18, { message: 'Age must be at least 18' })
  age?: number;
}
