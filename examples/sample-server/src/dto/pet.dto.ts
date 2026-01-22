import { Exclude, Expose } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsNotEmpty,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PickType, PartialType, IntersectionType } from '@nestjs/swagger';
import {
  PetInterface,
  PetCreatableInterface,
  PetUpdatableInterface,
  PetModelUpdatableInterface,
  PetStatus,
} from '../modules/pet/pet.interface';
import { UUID } from 'typeorm/driver/mongodb/bson.typings';

/**
 * Base Pet DTO that implements the PetInterface
 * Following SDK patterns with proper validation and API documentation
 */
@Exclude()
export class PetDto implements PetInterface {
  @Expose()
  @ApiProperty({
    description: 'Pet unique identifier',
    example: 'pet-123',
  })
  id!: string;

  @Expose()
  @ApiProperty({
    description: 'Pet name',
    example: 'Buddy',
    maxLength: 255,
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1, { message: 'Pet name must be at least 1 character' })
  @MaxLength(255, { message: 'Pet name cannot exceed 255 characters' })
  name!: string;

  @Expose()
  @ApiProperty({
    description: 'Pet species',
    example: 'dog',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Species cannot exceed 100 characters' })
  species!: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Pet breed',
    example: 'Golden Retriever',
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Breed cannot exceed 255 characters' })
  breed?: string;

  @Expose()
  @ApiProperty({
    description: 'Pet age in years',
    example: 3,
    minimum: 0,
    maximum: 50,
  })
  @IsInt()
  @Min(0, { message: 'Age must be at least 0' })
  @Max(50, { message: 'Age cannot exceed 50 years' })
  age!: number;

  @Expose()
  @ApiPropertyOptional({
    description: 'Pet color',
    example: 'golden',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Color cannot exceed 100 characters' })
  color?: string;

  @Expose()
  @ApiPropertyOptional({
    description: 'Pet description',
    example: 'A friendly and energetic dog',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @Expose()
  @ApiProperty({
    description: 'Pet status',
    example: PetStatus.ACTIVE,
    enum: PetStatus,
  })
  @IsEnum(PetStatus)
  status!: PetStatus;

  @Expose()
  @ApiProperty({
    description: 'User ID who owns this pet',
    example: 'user-123',
  })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @Expose()
  @ApiProperty({
    description: 'Date when the pet was created',
    example: '2023-01-01T00:00:00.000Z',
  })
  dateCreated!: Date;

  @Expose()
  @ApiProperty({
    description: 'Date when the pet was last updated',
    example: '2023-01-01T00:00:00.000Z',
  })
  dateUpdated!: Date;

  @Expose()
  @ApiPropertyOptional({
    description: 'Date when the pet was deleted (soft delete)',
    example: null,
  })
  dateDeleted!: Date | null;

  @Expose()
  @ApiProperty({
    description: 'Version number for optimistic locking',
    example: 1,
  })
  version!: number;
}

/**
 * Pet Create DTO
 * Follows SDK patterns using PickType - only includes required fields for creation
 * userId will be set from authenticated user context
 */
export class PetCreateDto 
  extends PickType(PetDto, ['name', 'species', 'age', 'breed', 'color', 'description', 'status'] as const) 
  implements PetCreatableInterface {
  
  // userId is handled by the controller/service from authenticated user context
  userId!: string;
}

/**
 * Pet Update DTO
 * Follows SDK patterns using IntersectionType and PartialType
 * Excludes userId from updates for security
 */
export class PetUpdateDto extends IntersectionType(
  PickType(PetDto, ['id'] as const),
  PartialType(PickType(PetDto, ['name', 'species', 'breed', 'age', 'color', 'description', 'status'] as const)),
) implements PetModelUpdatableInterface {
  // userId is intentionally excluded - cannot be updated
}

/**
 * Pet Response DTO
 * Used for API responses - includes all fields
 */
export class PetResponseDto extends PetDto {}

/**
 * Base Pet DTO for common operations
 * Can be extended by clients with their own validation rules
 */
export class BasePetDto {
  @ApiPropertyOptional({
    description: 'User ID who owns this pet',
    example: 'user-123',
  })
  userId?: string;
}