import {
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
} from '@nestjs/swagger';
import { AuthPublic } from '@concepta/nestjs-authentication';
import { InvitationService } from '@concepta/nestjs-invitation';
import { RocketsAuthInvitationAcceptDto } from '../dto/rockets-auth-invitation-accept.dto';
import { RocketsAuthInvitationNotAcceptedException } from '../invitation.exception';

/**
 * Invitation Acceptance Controller
 *
 * Handles invitation acceptance by users.
 * This is a public endpoint (no authentication required).
 * Security is provided by the OTP validation.
 */
@Controller('invitation-acceptance')
@AuthPublic()
@ApiTags('auth')
export class InvitationAcceptanceController {
  constructor(private readonly invitationService: InvitationService) {}

  /**
   * Accept an invitation
   *
   * Users accept invitations by providing the invitation code and OTP passcode.
   * The payload can contain any user data (firstName, lastName, password, metadata, etc.)
   * which will be processed by the InvitationUserAcceptanceListener.
   *
   * @param code - The invitation code (UUID) from the email
   * @param dto - Acceptance data containing passcode and optional user data payload
   * @returns void on success, throws exception on failure
   */
  @Patch(':code')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Accept invitation (Public with OTP)',
    description:
      'Accept an invitation by providing the code and OTP passcode. Include user data in the payload.',
  })
  @ApiParam({
    name: 'code',
    description: 'Invitation code from email',
    type: 'string',
  })
  @ApiOkResponse({
    description: 'Invitation accepted successfully',
  })
  async accept(
    @Param('code') code: string,
    @Body() dto: RocketsAuthInvitationAcceptDto,
  ): Promise<void> {
    const { passcode, payload } = dto;

    let success: boolean | null | undefined;

    try {
      success = await this.invitationService.accept({
        code,
        passcode,
        payload,
      });
    } catch (e) {
      Logger.error(e);
      throw e;
    }

    if (!success) {
      throw new RocketsAuthInvitationNotAcceptedException();
    }
  }
}
