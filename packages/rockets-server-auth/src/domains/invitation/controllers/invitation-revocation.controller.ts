import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { InvitationService } from '@concepta/nestjs-invitation';
import { AdminGuard } from '../../../guards/admin.guard';
import { RocketsAuthInvitationRevokeDto } from '../dto/rockets-auth-invitation-revoke.dto';

/**
 * Invitation Revocation Controller
 *
 * Handles revocation of invitations.
 * Requires admin authentication.
 */
@Controller('admin/invitations')
@UseGuards(AdminGuard)
@ApiBearerAuth()
@ApiTags('admin')
export class InvitationRevocationController {
  constructor(private readonly invitationService: InvitationService) {}

  /**
   * Revoke all invitations for an email and category
   *
   * Revokes all active invitations for a specific email address and category.
   * This is useful when you need to cancel pending invitations.
   *
   * @param dto - Revocation data containing email and category
   */
  @Post('revoke')
  @ApiOperation({
    summary: 'Revoke invitations (Admin only)',
    description:
      'Revoke all active invitations for a specific email and category',
  })
  @ApiCreatedResponse({
    description: 'Invitations revoked successfully',
  })
  async revoke(@Body() dto: RocketsAuthInvitationRevokeDto): Promise<void> {
    await this.invitationService.revokeAll({
      email: dto.email,
      category: dto.category,
    });
  }
}
