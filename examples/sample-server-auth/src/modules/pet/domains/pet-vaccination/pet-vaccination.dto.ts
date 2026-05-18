import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import {
  IsString,
  IsDate,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { CrudResponsePaginatedDto } from '@bitwild/rockets-crud';

/**
 * Pet Vaccination DTO
 * Used for API responses when fetching vaccination data
 */
export class PetVaccinationDto {
  @ApiProperty({
    description: 'Vaccination unique identifier',
    example: 'vacc-123',
  })
  @Expose()
  id!: string;

  @ApiProperty({
    description: 'Pet ID',
    example: 'pet-123',
  })
  @Expose()
  petId!: string;

  @ApiProperty({
    description: 'Vaccine name',
    example: 'Rabies',
  })
  @Expose()
  vaccineName!: string;

  @ApiProperty({
    description: 'Date vaccine was administered',
    example: '2023-01-15T10:00:00.000Z',
    type: Date,
  })
  @Expose()
  administeredDate!: Date;

  @ApiProperty({
    description: 'Next due date for this vaccine',
    example: '2024-01-15T10:00:00.000Z',
    type: Date,
    required: false,
  })
  @Expose()
  nextDueDate?: Date;

  @ApiProperty({
    description: 'Veterinarian who administered the vaccine',
    example: 'Dr. Smith',
  })
  @Expose()
  veterinarian!: string;

  @ApiProperty({
    description: 'Vaccine batch number',
    example: 'BATCH-2023-001',
    required: false,
  })
  @Expose()
  batchNumber?: string;

  @ApiProperty({
    description: 'Additional notes',
    required: false,
  })
  @Expose()
  notes?: string;

  @ApiProperty({
    description: 'Date created',
    type: Date,
  })
  @Expose()
  dateCreated!: Date;

  @ApiProperty({
    description: 'Date updated',
    type: Date,
  })
  @Expose()
  dateUpdated!: Date;

  @ApiProperty({
    description: 'Date deleted (soft delete)',
    type: Date,
    required: false,
    nullable: true,
  })
  @Expose()
  dateDeleted?: Date | null;

  @ApiProperty({
    description: 'Version for optimistic locking',
    example: 1,
  })
  @Expose()
  version!: number;
}

/**
 * Pet Vaccination Create DTO
 * Used when creating a new vaccination record
 */
export class PetVaccinationCreateDto {
  @ApiProperty({
    description: 'Pet ID',
    example: 'pet-123',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  petId!: string;

  @ApiProperty({
    description: 'Vaccine name',
    example: 'Rabies',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  vaccineName!: string;

  @ApiProperty({
    description: 'Date vaccine was administered',
    example: '2023-01-15T10:00:00.000Z',
    type: Date,
  })
  @Expose()
  @IsNotEmpty()
  @Type(() => Date)
  @IsDate()
  administeredDate!: Date;

  @ApiProperty({
    description: 'Next due date for this vaccine',
    example: '2024-01-15T10:00:00.000Z',
    type: Date,
    required: false,
  })
  @Expose()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  nextDueDate?: Date;

  @ApiProperty({
    description: 'Veterinarian who administered the vaccine',
    example: 'Dr. Smith',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  veterinarian!: string;

  @ApiProperty({
    description: 'Vaccine batch number',
    example: 'BATCH-2023-001',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @ApiProperty({
    description: 'Additional notes',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Pet Vaccination Update DTO
 * Used when updating an existing vaccination record
 */
export class PetVaccinationUpdateDto {
  @ApiProperty({
    description: 'Vaccination ID',
    example: 'vacc-123',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  id!: string;

  @ApiProperty({
    description: 'Vaccine name',
    example: 'Rabies',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  vaccineName?: string;

  @ApiProperty({
    description: 'Date vaccine was administered',
    example: '2023-01-15T10:00:00.000Z',
    type: Date,
    required: false,
  })
  @Expose()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  administeredDate?: Date;

  @ApiProperty({
    description: 'Next due date for this vaccine',
    example: '2024-01-15T10:00:00.000Z',
    type: Date,
    required: false,
  })
  @Expose()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  nextDueDate?: Date;

  @ApiProperty({
    description: 'Veterinarian who administered the vaccine',
    example: 'Dr. Smith',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  veterinarian?: string;

  @ApiProperty({
    description: 'Vaccine batch number',
    example: 'BATCH-2023-001',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @ApiProperty({
    description: 'Additional notes',
    required: false,
  })
  @Expose()
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * Pet Vaccination Create Many DTO
 * For bulk vaccination creation
 */
export class PetVaccinationCreateManyDto {
  @ApiProperty({
    type: [PetVaccinationCreateDto],
    description: 'Array of vaccinations to create',
  })
  @Type(() => PetVaccinationCreateDto)
  bulk!: PetVaccinationCreateDto[];
}

/**
 * Pet Vaccination Paginated DTO
 * For paginated vaccination responses
 */
export class PetVaccinationPaginatedDto extends CrudResponsePaginatedDto<PetVaccinationDto> {
  @ApiProperty({
    type: [PetVaccinationDto],
    description: 'Array of vaccinations',
  })
  @Expose()
  @Type(() => PetVaccinationDto)
  declare data: PetVaccinationDto[];
}
