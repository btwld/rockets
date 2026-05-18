import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Type,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { plainToInstance } from 'class-transformer';
import { AuthPublic } from '@concepta/nestjs-authentication';
import {
  AcceptInvitationCommand,
  CreateInvitationByEmailCommand,
  FindInvitationByCodeQuery,
  Invitation,
  InvitationNotFoundException,
  RevokeInvitationsCommand,
  SendInvitationCommand,
} from '@concepta/nestjs-invitation';

import { AdminGuard } from '../../../../../guards/admin.guard';
import { applyControllerExtras } from '../../../../../shared/utils/apply-controller-extras.helper';
import { RocketsAuthInvitationAcceptDto } from '../../../infrastructure/dto/rockets-auth-invitation-accept.dto';
import { RocketsAuthInvitationCreateDto } from '../../../infrastructure/dto/rockets-auth-invitation-create.dto';
import { RocketsAuthInvitationResponseDto } from '../../../infrastructure/dto/rockets-auth-invitation-response.dto';
import { RocketsAuthInvitationRevokeDto } from '../../../infrastructure/dto/rockets-auth-invitation-revoke.dto';
import { RocketsAuthInvitationNotAcceptedException } from '../../../domain/exceptions/invitation.exception';
import {
  InvitationAcceptanceControllerExtras,
  InvitationControllerExtras,
  InvitationReattemptControllerExtras,
  InvitationRevocationControllerExtras,
} from '../../../interfaces/invitation-controller-extras.interface';

/**
 * Build `POST /admin/invitations` (create + send).
 * Replaces the cast `} as RocketsAuthInvitationResponseDto` (W4) by
 * constructing the response DTO via `plainToInstance`.
 */
export function buildInvitationController(
  extras: InvitationControllerExtras = {},
): Type<unknown> {
  @Controller('admin/invitations')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiTags('admin')
  class InvitationController {
    private readonly logger = new Logger(InvitationController.name);
    constructor(private readonly commandBus: CommandBus) {}

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
      const invitation: Invitation = await this.commandBus.execute(
        new CreateInvitationByEmailCommand({}, dto),
      );
      let emailError: string | undefined;
      try {
        await this.commandBus.execute(
          new SendInvitationCommand({}, invitation.id),
        );
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

      return plainToInstance(RocketsAuthInvitationResponseDto, {
        ...invitation.toPlain(),
        emailSent: emailError === undefined,
        emailError,
      });
    }
  }

  applyControllerExtras(InvitationController, extras, { create: 'create' });
  return InvitationController;
}

/** Build `PATCH /invitation-acceptance/:code` (public). */
export function buildInvitationAcceptanceController(
  extras: InvitationAcceptanceControllerExtras = {},
): Type<unknown> {
  @Controller('invitation-acceptance')
  @AuthPublic()
  @ApiTags('auth')
  class InvitationAcceptanceController {
    constructor(private readonly commandBus: CommandBus) {}

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
    @ApiOkResponse({ description: 'Invitation accepted successfully' })
    async accept(
      @Param('code') code: string,
      @Body() dto: RocketsAuthInvitationAcceptDto,
    ): Promise<void> {
      const { passcode, payload } = dto;
      const result: Invitation | null = await this.commandBus.execute(
        new AcceptInvitationCommand({}, code, { passcode, payload }),
      );
      if (!result) {
        throw new RocketsAuthInvitationNotAcceptedException();
      }
    }
  }

  applyControllerExtras(InvitationAcceptanceController, extras, {
    accept: 'accept',
  });
  return InvitationAcceptanceController;
}

/** Build `POST /admin/invitations/revoke`. */
export function buildInvitationRevocationController(
  extras: InvitationRevocationControllerExtras = {},
): Type<unknown> {
  @Controller('admin/invitations')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiTags('admin')
  class InvitationRevocationController {
    constructor(private readonly commandBus: CommandBus) {}

    @Post('revoke')
    @ApiOperation({
      summary: 'Revoke invitations (Admin only)',
      description:
        'Revoke all active invitations for a specific email and category',
    })
    @ApiCreatedResponse({ description: 'Invitations revoked successfully' })
    async revoke(@Body() dto: RocketsAuthInvitationRevokeDto): Promise<void> {
      await this.commandBus.execute(
        new RevokeInvitationsCommand({}, dto.email, dto.category),
      );
    }
  }

  applyControllerExtras(InvitationRevocationController, extras, {
    revoke: 'revoke',
  });
  return InvitationRevocationController;
}

/** Build `POST /admin/invitations/:code/reattempt`. */
export function buildInvitationReattemptController(
  extras: InvitationReattemptControllerExtras = {},
): Type<unknown> {
  @Controller('admin/invitations')
  @UseGuards(AdminGuard)
  @ApiBearerAuth()
  @ApiTags('admin')
  class InvitationReattemptController {
    constructor(
      private readonly commandBus: CommandBus,
      private readonly queryBus: QueryBus,
    ) {}

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
    @ApiCreatedResponse({
      description: 'Invitation email re-sent successfully',
    })
    async reattempt(@Param('code') code: string): Promise<void> {
      const invitation: Invitation | null = await this.queryBus.execute(
        new FindInvitationByCodeQuery({}, code),
      );
      if (!invitation) {
        throw new InvitationNotFoundException(code);
      }
      await this.commandBus.execute(
        new SendInvitationCommand({}, invitation.id),
      );
    }
  }

  applyControllerExtras(InvitationReattemptController, extras, {
    reattempt: 'reattempt',
  });
  return InvitationReattemptController;
}
