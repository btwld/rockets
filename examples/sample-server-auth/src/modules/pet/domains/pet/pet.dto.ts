import { Exclude, Expose, Type } from 'class-transformer';
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CrudResponsePaginatedDto } from '@concepta/nestjs-crud';
import {
  PetInterface,
  PetCreatableInterface,
  PetModelUpdatableInterface,
  PetStatus,
} from './pet.interface';
import { PetVaccinationDto } from '../pet-vaccination';
import { PetAppointmentDto } from '../pet-appointment';

/**
 * Base Pet DTO that implements the PetInterface
 * Following SDK patterns with proper validation and API documentation
 */
@Exclude()
export class PetDto implements PetInterface {
  @ApiProperty({
    description: 'Pet unique identifier',
    example: 'pet-123',
  })
  id!: string;

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

  @ApiProperty({
    description: 'Pet species',
    example: 'dog',
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Species cannot exceed 100 characters' })
  species!: string;

  @ApiPropertyOptional({
    description: 'Pet breed',
    example: 'Golden Retriever',
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Breed cannot exceed 255 characters' })
  breed?: string;

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

  @ApiPropertyOptional({
    description: 'Pet color',
    example: 'golden',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Color cannot exceed 100 characters' })
  color?: string;

  @ApiPropertyOptional({
    description: 'Pet description',
    example: 'A friendly and energetic dog',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Pet status',
    example: PetStatus.ACTIVE,
    enum: PetStatus,
  })
  @IsEnum(PetStatus)
  status!: PetStatus;

  @ApiProperty({
    description: 'User ID who owns this pet',
    example: 'user-123',
  })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({
    description: 'Date when the pet was created',
    example: '2023-01-01T00:00:00.000Z',
  })
  dateCreated!: Date;

  @ApiProperty({
    description: 'Date when the pet was last updated',
    example: '2023-01-01T00:00:00.000Z',
  })
  dateUpdated!: Date;

  @ApiPropertyOptional({
    description: 'Date when the pet was deleted (soft delete)',
    example: null,
  })
  dateDeleted!: Date | null;

  @ApiProperty({
    description: 'Version number for optimistic locking',
    example: 1,
  })
  version!: number;
}

/**
 * Pet Create DTO
 * Defines required fields for pet creation
 * userId will be set from authenticated user context
 */
@Exclude()
export class PetCreateDto implements PetCreatableInterface {
  @ApiProperty({
    description: 'Pet name',
    example: 'Buddy',
    maxLength: 255,
    minLength: 1,
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: 'Pet species', example: 'dog', maxLength: 100 })
  @Expose()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  species!: string;

  @ApiProperty({
    description: 'Pet age in years',
    example: 3,
    minimum: 0,
    maximum: 50,
  })
  @Expose()
  @IsInt()
  @Min(0)
  @Max(50)
  age!: number;

  @ApiPropertyOptional({
    description: 'Pet breed',
    example: 'Golden Retriever',
    maxLength: 255,
  })
  @Expose()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  breed?: string;

  @ApiPropertyOptional({
    description: 'Pet color',
    example: 'golden',
    maxLength: 100,
  })
  @Expose()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  color?: string;

  @ApiPropertyOptional({
    description: 'Pet description',
    example: 'A friendly dog',
  })
  @Expose()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Pet status',
    example: PetStatus.ACTIVE,
    enum: PetStatus,
  })
  @Expose()
  @IsEnum(PetStatus)
  status!: PetStatus;

  /** Must be exposed or ValidationPipe (whitelist) strips it before PetCreateHandler runs. */
  @ApiProperty({
    description: 'Owner user id (PetCreateHandler may override from auth)',
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

/**
 * Pet Update DTO
 * Defines fields that can be updated
 * Excludes userId from updates for security
 */
@Exclude()
export class PetUpdateDto implements PetModelUpdatableInterface {
  @ApiProperty({ description: 'Pet ID', example: 'pet-123' })
  @Expose()
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiPropertyOptional({
    description: 'Pet name',
    example: 'Buddy',
    maxLength: 255,
  })
  @Expose()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Pet species',
    example: 'dog',
    maxLength: 100,
  })
  @Expose()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  species?: string;

  @ApiPropertyOptional({
    description: 'Pet breed',
    example: 'Golden Retriever',
    maxLength: 255,
  })
  @Expose()
  @IsString()
  @IsOptional()
  @MaxLength(255)
  breed?: string;

  @ApiPropertyOptional({
    description: 'Pet age',
    example: 3,
    minimum: 0,
    maximum: 50,
  })
  @Expose()
  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(50)
  age?: number;

  @ApiPropertyOptional({
    description: 'Pet color',
    example: 'golden',
    maxLength: 100,
  })
  @Expose()
  @IsString()
  @IsOptional()
  @MaxLength(100)
  color?: string;

  @ApiPropertyOptional({ description: 'Pet description' })
  @Expose()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Pet status', enum: PetStatus })
  @Expose()
  @IsEnum(PetStatus)
  @IsOptional()
  status?: PetStatus;

  // userId is intentionally excluded - cannot be updated
}

/**
 * Pet Response DTO
 * Used for API responses - includes all fields
 */
@Exclude()
export class PetResponseDto implements PetInterface {
  @ApiProperty({ description: 'Pet unique identifier', example: 'pet-123' })
  @Expose()
  id!: string;

  @ApiProperty({ description: 'Pet name', example: 'Buddy' })
  @Expose()
  name!: string;

  @ApiProperty({ description: 'Pet species', example: 'dog' })
  @Expose()
  species!: string;

  @ApiPropertyOptional({
    description: 'Pet breed',
    example: 'Golden Retriever',
  })
  @Expose()
  breed?: string;

  @ApiProperty({ description: 'Pet age', example: 3 })
  @Expose()
  age!: number;

  @ApiPropertyOptional({ description: 'Pet color', example: 'golden' })
  @Expose()
  color?: string;

  @ApiPropertyOptional({ description: 'Pet description' })
  @Expose()
  description?: string;

  @ApiProperty({ description: 'Pet status', enum: PetStatus })
  @Expose()
  status!: PetStatus;

  @ApiProperty({ description: 'User ID', example: 'user-123' })
  @Expose()
  userId!: string;

  @ApiProperty({ description: 'Creation date' })
  @Expose()
  dateCreated!: Date;

  @ApiProperty({ description: 'Update date' })
  @Expose()
  dateUpdated!: Date;

  @ApiPropertyOptional({ description: 'Deletion date' })
  @Expose()
  dateDeleted!: Date | null;

  @ApiProperty({ description: 'Version number' })
  @Expose()
  version!: number;

  @ApiPropertyOptional({
    type: [PetVaccinationDto],
    description: 'Pet vaccinations',
  })
  @Expose()
  @Type(() => PetVaccinationDto)
  vaccinations?: PetVaccinationDto[];

  @ApiPropertyOptional({
    type: [PetAppointmentDto],
    description: 'Pet appointments',
  })
  @Expose()
  @Type(() => PetAppointmentDto)
  appointments?: PetAppointmentDto[];
}

/**
 * Pet Create Many DTO
 * For bulk pet creation
 */
export class PetCreateManyDto {
  @ApiProperty({
    type: [PetCreateDto],
    description: 'Array of pets to create',
  })
  @Type(() => PetCreateDto)
  bulk!: PetCreateDto[];
}

/**
 * Pet Paginated DTO
 * Extends CrudResponsePaginatedDto for paginated responses
 */
export class PetPaginatedDto extends CrudResponsePaginatedDto<PetResponseDto> {
  @ApiProperty({
    type: [PetResponseDto],
    description: 'Array of pets',
  })
  @Expose()
  @Type(() => PetResponseDto)
  declare data: PetResponseDto[];
}

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
