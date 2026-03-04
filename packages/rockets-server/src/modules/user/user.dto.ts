import {
  IsOptional,
  IsObject,
  IsDefined,
  Allow,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class RoleNameDto {
  @ApiProperty({ description: 'Role name', example: 'admin' })
  name!: string;
}

export class UserRoleItemDto {
  @ApiProperty({ description: 'Role object', type: () => RoleNameDto })
  @Type(() => RoleNameDto)
  role!: RoleNameDto;
}

/**
 * User update DTO with dynamic userMetadata structure.
 * Actual userMetadata validation is handled by the dynamically configured DTO classes.
 */
export class UserUpdateDto {
  @ApiPropertyOptional({
    description:
      'UserMetadata data to update - structure is defined dynamically',
    type: 'object',
    additionalProperties: true,
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
 * User response DTO containing auth user data and userMetadata.
 */
export class UserResponseDto {
  @ApiProperty({
    description: 'User ID from auth provider',
    example: 'user-123',
  })
  @IsDefined()
  @Allow()
  id!: string;

  @ApiProperty({
    description: 'User subject from auth provider',
    example: 'user-123',
  })
  @IsDefined()
  @Allow()
  sub!: string;

  @ApiPropertyOptional({
    description: 'User email from auth provider',
    example: 'user@example.com',
  })
  @IsOptional()
  @Allow()
  email?: string;

  @ApiPropertyOptional({
    description: 'User roles from auth provider',
    example: [{ role: { name: 'user' } }, { role: { name: 'admin' } }],
    type: UserRoleItemDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @Type(() => UserRoleItemDto)
  userRoles?: UserRoleItemDto[];

  @ApiPropertyOptional({
    description: 'User claims from auth provider',
    example: { iss: 'auth-provider', aud: 'app' },
  })
  @IsOptional()
  @IsObject()
  claims?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'UserMetadata data - structure is defined dynamically',
    type: 'object',
    additionalProperties: true,
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
