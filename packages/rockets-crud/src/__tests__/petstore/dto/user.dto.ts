import { Exclude, Expose } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

import { ApiPropertyOptional } from '@nestjs/swagger';

@Exclude()
export class User {
  @ApiPropertyOptional({ type: 'integer', format: 'int64' })
  @Expose()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiPropertyOptional({})
  @Expose()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({})
  @Expose()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({})
  @Expose()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({})
  @Expose()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({})
  @Expose()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({})
  @Expose()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ type: 'integer', format: 'int32' })
  @Expose()
  @IsOptional()
  @IsInt()
  userStatus?: number;
}
