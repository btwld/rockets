import { IsOptional, IsObject, IsDefined, Allow } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Generic User Update DTO
 * This DTO is generic and uses dynamic userMetadata structure
 * The actual userMetadata validation is handled by the dynamically configured DTO classes
 * Follows SDK patterns for DTOs
 */
export class UserUpdateDto {
  @ApiPropertyOptional({
    description:
      'UserMetadata data to update - structure is defined dynamically',
    type: 'object',
    example: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      bio: 'Software Developer',
    },
  })
  @IsOptional()
  @IsObject()
  userMetadata?: Record<string, unknown>;
}

/**
 * Generic User Response DTO
 * Contains auth user data + userMetadata
 * Follows SDK patterns for response DTOs
 */
export class UserResponseDto {
  @ApiProperty({
    description: 'User ID from auth provider',
    example: 'user-123',
  })
  @IsDefined()
  @Allow()
  id: string;

  @ApiProperty({
    description: 'User subject from auth provider',
    example: 'user-123',
  })
  @IsDefined()
  @Allow()
  sub: string;

  @ApiPropertyOptional({
    description: 'User email from auth provider',
    example: 'user@example.com',
  })
  @IsOptional()
  @Allow()
  email?: string;

  @ApiPropertyOptional({
    description: 'User roles from auth provider',
    example: ['user', 'admin'],
    type: String,
    isArray: true,
  })
  @IsOptional()
  @Allow()
  roles?: string[];

  @ApiPropertyOptional({
    description: 'User claims from auth provider',
    example: { iss: 'auth-provider', aud: 'app' },
  })
  @IsOptional()
  @IsObject()
  @Allow()
  claims?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'UserMetadata data from user userMetadata - structure is defined dynamically',
    type: 'object',
    example: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      bio: 'Software Developer',
    },
  })
  @IsOptional()
  @IsObject()
  userMetadata?: Record<string, unknown>;
}
