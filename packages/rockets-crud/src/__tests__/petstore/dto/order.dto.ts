import { Exclude, Expose, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsInt, IsOptional } from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class Order {
  @ApiPropertyOptional({ type: 'integer', format: 'int64' })
  @Expose()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int64' })
  @Expose()
  @IsOptional()
  @IsInt()
  petId?: number;

  @ApiPropertyOptional({ type: 'integer', format: 'int32' })
  @Expose()
  @IsOptional()
  @IsInt()
  quantity?: number;

  @ApiPropertyOptional({ type: 'string', format: 'date-time' })
  @Expose()
  @Type(() => Date)
  @IsOptional()
  @IsDate()
  shipDate?: Date;

  @ApiPropertyOptional({
    enum: ['placed', 'approved', 'delivered'],
  })
  @Expose()
  @IsOptional()
  @IsEnum(['placed', 'approved', 'delivered'])
  status?: 'placed' | 'approved' | 'delivered';

  @ApiPropertyOptional({})
  @Expose()
  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}
