import { Body, Controller, Post, UseGuards, Logger } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { InvitationService } from '@concepta/nestjs-invitation';
import { AdminGuard } from '../../../guards/admin.guard';
import { RocketsAuthInvitationCreateDto } from '../dto/rockets-auth-invitation-create.dto';
import { RocketsAuthInvitationResponseDto } from '../dto/rockets-auth-invitation-response.dto';

/**
 * Invitation Controller
 *
 * Handles creation and sending of invitations.
 * Requires admin authentication.
 */
@Controller('admin/invitations')
@UseGuards(AdminGuard)
@ApiBearerAuth()
@ApiTags('admin')
export class InvitationController {
  private readonly logger = new Logger(InvitationController.name);

  constructor(private readonly invitationService: InvitationService) {}

  /**
   * Create and send a new invitation
   *
   * Creates a new invitation for a user and immediately sends the email with OTP.
   * Only admins can create invitations.
   *
   * If email sending fails, the invitation is still returned with emailSent=false
   * and emailError containing the error message. Use POST /admin/invitations/:code/reattempt
   * to retry sending the email.
   *
   * @param dto - Invitation creation data (email, category, constraints)
   * @returns The created invitation with email sending status
   */
  @Post()
  @ApiOperation({
    summary: 'Create and send invitation (Admin only)',
    description:
      'Creates a new user invitation and sends an email with OTP for acceptance. ' +
      'If email sending fails, the invitation is still returned. Check emailSent field ' +
      'and use POST /admin/invitations/:code/reattempt to retry.',
  })
  @ApiCreatedResponse({
    description:
      'Invitation created. Check emailSent field to verify if email was sent successfully.',
    type: RocketsAuthInvitationResponseDto,
  })
  async create(
    @Body() dto: RocketsAuthInvitationCreateDto,
  ): Promise<RocketsAuthInvitationResponseDto> {
    const invitation = await this.invitationService.create(dto);
    let emailError: string | undefined;

    try {
      await this.invitationService.send(invitation);
      this.logger.log('Invitation sent successfully', {
        invitationId: invitation.id,
        email: dto.email,
      });
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e);
      this.logger.error('Failed to send invitation', {
        invitationId: invitation.id,
        email: dto.email,
        error: emailError,
      });
    }

    // Return invitation with email status
    return {
      ...invitation,
      emailSent: emailError === undefined,
      emailError,
    } as RocketsAuthInvitationResponseDto;
  }
}
