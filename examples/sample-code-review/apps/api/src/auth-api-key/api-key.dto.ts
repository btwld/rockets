import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiPropertyOptional({
    example: 'CI pipeline',
    description: 'Human-readable label to identify this key later.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class ApiKeyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    description: 'First 8 characters of the key — used to identify it.',
    example: 'a1b2c3d4',
  })
  keyPrefix!: string;

  @ApiPropertyOptional({ example: 'CI pipeline' })
  name?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  lastUsedAt?: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  dateCreated!: Date;
}

export class CreateApiKeyResponseDto extends ApiKeyResponseDto {
  @ApiProperty({
    description:
      'Full key value — shown ONCE. Store it securely; it cannot be retrieved again.',
    example: 'a1b2c3d4e5f6...',
  })
  key!: string;
}

export class RevokeApiKeyDto {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  @IsNotEmpty()
  id!: string;
}
