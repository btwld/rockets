import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
} from '@nestjs/swagger';
import { InvitationAttemptService } from '@concepta/nestjs-invitation/dist/services/invitation-attempt.service';
import { AdminGuard } from '../../../guards/admin.guard';

/**
 * Invitation Reattempt Controller
 *
 * Handles re-sending invitation emails.
 * Requires admin authentication.
 */
@Controller('admin/invitations')
@UseGuards(AdminGuard)
@ApiBearerAuth()
@ApiTags('admin')
export class InvitationReattemptController {
  constructor(
    private readonly invitationAttemptService: InvitationAttemptService,
  ) {}

  /**
   * Re-send an invitation email
   *
   * Generates a new OTP and re-sends the invitation email for an existing invitation.
   * Useful when the original email was not received or the OTP expired.
   *
   * @param code - The invitation code to re-send
   */
  @Post(':code/reattempt')
  @ApiOperation({
    summary: 'Re-send invitation email (Admin only)',
    description: 'Generates a new OTP and re-sends the invitation email',
  })
  @ApiParam({
    name: 'code',
    description: 'Invitation code',
    type: 'string',
  })
  @ApiOkResponse({
    description: 'Invitation email re-sent successfully',
  })
  async reattempt(@Param('code') code: string): Promise<void> {
    await this.invitationAttemptService.send(code);
  }
}
