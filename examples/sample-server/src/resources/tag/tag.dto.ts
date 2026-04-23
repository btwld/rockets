import { Exclude, Expose } from 'class-transformer';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  PartialType,
  PickType,
} from '@nestjs/swagger';

@Exclude()
export class TagDto {
  @Expose() @ApiProperty() id!: string;

  @Expose()
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @Expose()
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  @MaxLength(20)
  color?: string;

  @Expose() @ApiProperty() dateCreated!: Date;
  @Expose() @ApiProperty() dateUpdated!: Date;
}

export class TagCreateDto extends PickType(TagDto, ['name', 'color'] as const) {}

export class TagUpdateDto extends IntersectionType(
  PickType(TagDto, ['id'] as const),
  PartialType(PickType(TagDto, ['name', 'color'] as const)),
) {}

export class TagResponseDto extends TagDto {}
