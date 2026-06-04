import { Exclude, Expose, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Category } from './category.dto';
import { Tag } from './tag.dto';

@Exclude()
export class Pet {
  @ApiPropertyOptional({ type: 'integer', format: 'int64' })
  @Expose()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty()
  @Expose()
  @IsString()
  name: string = '';

  @ApiPropertyOptional({ type: () => Category })
  @Expose()
  @Type(() => Category)
  @IsOptional()
  @ValidateNested()
  category?: Category;

  @ApiProperty({ type: String, isArray: true })
  @Expose()
  @IsArray()
  @IsString({ each: true })
  photoUrls: string[] = [];

  @ApiPropertyOptional({ type: () => Tag, isArray: true })
  @Expose()
  @Type(() => Tag)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  tags?: Tag[];

  @ApiPropertyOptional({
    enum: ['available', 'pending', 'sold'],
  })
  @Expose()
  @IsOptional()
  @IsEnum(['available', 'pending', 'sold'])
  status?: 'available' | 'pending' | 'sold';
}
