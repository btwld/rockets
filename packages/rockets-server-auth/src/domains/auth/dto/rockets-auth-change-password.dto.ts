import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * DTO for authenticated password change
 *
 * Used when a logged-in user wants to change their own password.
 * Requires the current password for verification before allowing the change.
 */
export class RocketsAuthChangePasswordDto {
  /**
   * The user's current password for verification
   */
  @IsNotEmpty()
  @IsString()
  @ApiProperty({
    title: 'Current Password',
    type: 'string',
    description: 'The user current password for verification',
    example: 'CurrentP@ssw0rd',
  })
  currentPassword!: string;

  /**
   * The new password to set
   */
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @ApiProperty({
    title: 'New Password',
    type: 'string',
    description: 'The new password to set (minimum 8 characters)',
    example: 'NewSecureP@ssw0rd',
    minLength: 8,
  })
  newPassword!: string;
}
