import { Body, Controller, Post, UseGuards, Logger } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { InvitationService } from '@concepta/nestjs-invitation';
import { AdminGuard } from '../../../guards/admin.guard';
import { RuntimeException } from '@concepta/nestjs-common';
import { RocketsAuthInvitationException } from '../invitation.exception';
import { RocketsAuthInvitationCreateDto } from '../dto/rockets-auth-invitation-create.dto';
import { RocketsAuthInvitationDto } from '../dto/rockets-auth-invitation.dto';

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
   * @param dto - Invitation creation data (email, category, constraints)
   * @returns The created invitation
   */
  @Post()
  @ApiOperation({
    summary: 'Create and send invitation (Admin only)',
    description:
      'Creates a new user invitation and sends an email with OTP for acceptance',
  })
  @ApiCreatedResponse({
    description: 'Invitation created and email sent successfully',
    type: RocketsAuthInvitationDto,
  })
  async create(@Body() dto: RocketsAuthInvitationCreateDto) {
    const invitation = await this.invitationService.create(dto);
    try {
      await this.invitationService.send(invitation);
      this.logger.log('Invitation sent successfully', {
        invitationId: invitation.id,
        email: dto.email,
      });
    } catch (e) {
      this.logger.error('Failed to send invitation', {
        invitationId: invitation.id,
        email: dto.email,
        error: e instanceof Error ? e.message : String(e),
      });
      if (e instanceof RuntimeException) {
        throw e;
      }
      throw new RocketsAuthInvitationException(
        'Error trying to send invitation.',
        { originalError: e },
      );
    }
    return invitation;
  }
}
