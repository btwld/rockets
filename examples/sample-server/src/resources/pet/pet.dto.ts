import { Exclude, Expose, Type } from 'class-transformer';
import { IsString, IsEnum, IsOptional, IsInt, IsArray, Min, Max, IsNotEmpty, MaxLength, MinLength, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PickType, PartialType, IntersectionType } from '@nestjs/swagger';
import { PetStatus } from './pet.entity';
import { PetVaccinationResponseDto } from '../pet-vaccination/pet-vaccination.dto';
import { TagResponseDto } from '../tag/tag.dto';

@Exclude()
export class PetDto {
  @Expose() @ApiProperty() id!: string;
  @Expose() @ApiProperty() @IsString() @IsNotEmpty() @MinLength(1) @MaxLength(255) name!: string;
  @Expose() @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) species!: string;
  @Expose() @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(255) breed?: string;
  @Expose() @ApiProperty() @IsInt() @Min(0) @Max(50) age!: number;
  @Expose() @ApiPropertyOptional() @IsString() @IsOptional() @MaxLength(100) color?: string;
  @Expose() @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
  @Expose() @ApiProperty({ enum: PetStatus }) @IsEnum(PetStatus) status!: PetStatus;
  @Expose() @ApiProperty() @IsString() @IsNotEmpty() userId!: string;
  @Expose() @ApiProperty() dateCreated!: Date;
  @Expose() @ApiProperty() dateUpdated!: Date;
  @Expose() @ApiPropertyOptional() dateDeleted!: Date | null;
  @Expose() @ApiProperty() version!: number;
}

export class PetCreateDto extends PickType(PetDto, [
  'name',
  'species',
  'age',
  'breed',
  'color',
  'description',
  'status',
] as const) {
  @Expose()
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Optional. If provided, must be a UUID v4 and must match the authenticated user.',
  })
  @IsOptional()
  @IsUUID('4', { message: 'userId must be a valid UUID v4' })
  userId?: string;

  @Expose()
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description: 'Tag IDs to attach to the pet (many-to-many).',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'tagIds must be an array of UUID v4' })
  tagIds?: string[];
}

export class PetUpdateDto extends IntersectionType(
  PickType(PetDto, ['id'] as const),
  PartialType(PickType(PetDto, ['name', 'species', 'breed', 'age', 'color', 'description', 'status'] as const)),
) {
  @Expose()
  @ApiPropertyOptional({
    type: [String],
    format: 'uuid',
    description:
      'Replace tag set. Omit to leave tags untouched; pass [] to clear.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'tagIds must be an array of UUID v4' })
  tagIds?: string[];
}

export class PetResponseDto extends PetDto {
  @Expose() @IsArray() @Type(() => PetVaccinationResponseDto)
  @ApiProperty({ type: [PetVaccinationResponseDto], required: false })
  vaccinations?: PetVaccinationResponseDto[];

  @Expose() @IsArray() @Type(() => TagResponseDto)
  @ApiProperty({ type: [TagResponseDto], required: false })
  tags?: TagResponseDto[];
}

