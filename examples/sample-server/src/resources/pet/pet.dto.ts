import { Exclude, Expose, Transform, Type } from 'class-transformer';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
  IsNotEmpty,
  MaxLength,
  MinLength,
  IsUUID,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
  PickType,
} from '@nestjs/swagger';
import { PetStatus } from './pet.entity';
import { PetVaccinationResponseDto } from '../pet-vaccination/pet-vaccination.dto';
import { TagResponseDto } from '../tag/tag.dto';
import type { PetTagEntity } from './pet-tag.entity';

@Exclude()
class PetCreateUniqueRefFields {
  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(64)
  uniqueRef?: string;
}

@Exclude()
export class PetDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;
  @Expose()
  @ApiProperty({ example: 'Buddy' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
  @Expose()
  @ApiProperty({ example: 'dog' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  species!: string;
  @Expose()
  @ApiPropertyOptional({ example: 'Labrador' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  breed?: string;
  @Expose() @ApiProperty({ minimum: 0, maximum: 50 }) @IsInt() @Min(0) @Max(50) age!: number;
  @Expose()
  @ApiPropertyOptional({ example: 'golden' })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  color?: string;
  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
  @Expose()
  @ApiProperty({ enum: PetStatus })
  @IsEnum(PetStatus)
  status!: PetStatus;
  @Expose() @ApiProperty({ format: 'uuid' }) @IsString() @IsNotEmpty() userId!: string;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateCreated!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateUpdated!: Date;
  @Expose() @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) dateDeleted!: Date | null;
  @Expose() @ApiProperty({ description: 'Optimistic lock version' }) version!: number;
}

/**
 * Tag attachment is no longer part of the pet payload — it lives on
 * the explicit junction resource at `POST /pets/:petId/tags`. Same
 * for `userId`, which is stamped from the actor by `OwnerStampHook`.
 */
export class PetCreateDto extends IntersectionType(
  PickType(PetDto, [
    'name',
    'species',
    'age',
    'breed',
    'color',
    'description',
    'status',
  ] as const),
  PetCreateUniqueRefFields,
) {}

export class PetUpdateDto extends IntersectionType(
  PickType(PetDto, ['id'] as const),
  PartialType(
    PickType(PetDto, [
      'name',
      'species',
      'breed',
      'age',
      'color',
      'description',
      'status',
    ] as const),
  ),
) {}

export class PetResponseDto extends PetDto {
  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(64)
  uniqueRef?: string | null;

  @Expose()
  @IsArray()
  @Type(() => PetVaccinationResponseDto)
  @ApiProperty({ type: [PetVaccinationResponseDto], required: false })
  vaccinations?: PetVaccinationResponseDto[];

  /**
   * Flat tag projection derived from the eager-loaded `petTags`
   * collection on the entity. Kept for response-shape compatibility
   * with clients that consumed the previous M:N `@JoinTable` mapping.
   */
  @Expose()
  @IsArray()
  @Type(() => TagResponseDto)
  @Transform(
    ({ obj }: { obj: { petTags?: PetTagEntity[] } }) => {
      const petTags = Array.isArray(obj?.petTags) ? obj.petTags : [];
      return petTags
        .map((pt) => pt.tag)
        .filter((t): t is NonNullable<typeof t> => Boolean(t));
    },
    { toClassOnly: true },
  )
  @ApiProperty({ type: [TagResponseDto], required: false })
  tags?: TagResponseDto[];
}
