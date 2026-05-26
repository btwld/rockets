import { Exclude, Expose } from 'class-transformer';
import { IsString, IsOptional, IsNotEmpty, MaxLength } from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
  PickType,
} from '@nestjs/swagger';

@Exclude()
export class TagDto {
  @Expose() @ApiProperty({ format: 'uuid' }) id!: string;

  @Expose()
  @ApiProperty({ example: 'vaccinated' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Expose()
  @ApiPropertyOptional({ example: '#ff0000' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;

  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateCreated!: Date;
  @Expose() @ApiProperty({ type: String, format: 'date-time' }) dateUpdated!: Date;
}

export class TagCreateDto extends PickType(TagDto, [
  'name',
  'color',
] as const) {}

export class TagUpdateDto extends IntersectionType(
  PickType(TagDto, ['id'] as const),
  PartialType(PickType(TagDto, ['name', 'color'] as const)),
) {}

export class TagResponseDto extends TagDto {}
