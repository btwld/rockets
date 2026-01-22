import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
} from '@nestjs/swagger';
import { RocketsAuthInvitationDto } from './rockets-auth-invitation.dto';

/**
 * Email status information for invitation response
 */
export class InvitationEmailStatusDto {
  @ApiProperty({
    description: 'Whether the invitation email was sent successfully',
    example: true,
  })
  emailSent!: boolean;

  @ApiPropertyOptional({
    description:
      'Error message if email sending failed. Use POST /admin/invitations/:code/reattempt to retry.',
    example: 'SMTP connection timeout',
  })
  emailError?: string;
}

/**
 * Rockets Auth Invitation Response DTO
 *
 * Extends the base invitation DTO with email sending status information.
 * This allows the API to return the invitation even if email sending fails,
 * enabling admins to use the reattempt endpoint to retry sending.
 */
export class RocketsAuthInvitationResponseDto extends IntersectionType(
  RocketsAuthInvitationDto,
  InvitationEmailStatusDto,
) {}
