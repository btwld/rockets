import { Exclude, Expose } from 'class-transformer';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';

@Exclude()
export class PetVaccinationDto {
  @Expose()
  @ApiProperty({ description: 'Vaccination ID', example: 'vacc-123' })
  id!: string;

  @Expose()
  @ApiProperty({ description: 'Vaccine name', example: 'Rabies' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Expose()
  @ApiProperty({ description: 'Date administered', example: '2024-01-15' })
  @IsString()
  @IsNotEmpty()
  dateAdministered!: string;

  @Expose()
  @ApiPropertyOptional({ description: 'Expiration date', example: '2025-01-15' })
  @IsString()
  @IsOptional()
  dateExpires?: string;

  @Expose()
  @ApiProperty({ description: 'Pet ID', example: 'pet-123' })
  @IsString()
  @IsNotEmpty()
  petId!: string;
}

export class PetVaccinationCreateDto extends PickType(PetVaccinationDto, [
  'name',
  'dateAdministered',
  'dateExpires',
  'petId',
] as const) {}

export class PetVaccinationResponseDto extends PetVaccinationDto {}
