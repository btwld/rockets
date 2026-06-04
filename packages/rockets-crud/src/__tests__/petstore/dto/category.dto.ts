import { Exclude, Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class Category {
  @ApiPropertyOptional({ type: 'integer', format: 'int64' })
  @Expose()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiPropertyOptional({})
  @Expose()
  @IsOptional()
  @IsString()
  name?: string;
}
