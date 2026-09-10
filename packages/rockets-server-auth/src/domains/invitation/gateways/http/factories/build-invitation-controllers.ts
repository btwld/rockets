import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Req,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import type { Type } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthPublic } from '@concepta/nestjs-authentication';
import {
  AcceptInvitationCommand,
  CreateInvitationByEmailCommand,
  FindInvitationByCodeQuery,
  InvitationNotFoundException,
  RevokeInvitationsCommand,
  SendInvitationCommand,
  type Invitation,
} from '@concepta/nestjs-invitation';
import { getAppContext, rocketsSchemaValidation } from '@concepta/rockets-core';
import type { Request } from 'express';
import type { z } from 'zod';

import { AdminGuard } from '../../../../../guards/admin.guard';
import { RateLimit, RateLimitGuard } from '@concepta/rockets-core';
import { applyControllerExtras } from '../../../../../shared/utils/apply-controller-extras.helper';
import { rocketsAuthInvitationAcceptSchema } from '../../../infrastructure/schemas/rockets-auth-invitation-accept.schema';
import { rocketsAuthInvitationCreateSchema } from '../../../infrastructure/schemas/rockets-auth-invitation-create.schema';
import { rocketsAuthInvitationResponseSchema } from '../../../infrastructure/schemas/rockets-auth-invitation-response.schema';
import { rocketsAuthInvitationRevokeSchema } from '../../../infrastructure/schemas/rockets-auth-invitation-revoke.schema';
import { RocketsAuthInvitationNotAcceptedException } from '../../../domain/exceptions/invitation.exception';
import type {
  InvitationAcceptanceControllerExtras,
  InvitationControllerExtras,
  InvitationReattemptControllerExtras,
  InvitationRevocationControllerExtras,
} from '../../../interfaces/invitation-controller-extras.interface';

type InvitationCreateBody = z.output<typeof rocketsAuthInvitationCreateSchema>;
type InvitationAcceptBody = z.output<typeof rocketsAuthInvitationAcceptSchema>;
type InvitationRevokeBody = z.output<typeof rocketsAuthInvitationRevokeSchema>;
type InvitationResponse = z.output<typeof rocketsAuthInvitationResponseSchema>;

/** Build `POST /admin/invitations`; the response is serialized by its schema. */
export function buildInvitationController(
  extras: InvitationControllerExtras = {},
): Type<unknown> {
  @Controller('admin/invitations')
  @UseGuards(AdminGuard)
  @UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
  @ApiBearerAuth()
  @ApiTags('admin')
  class InvitationController {
    private readonly logger = new Logger(InvitationController.name);
    constructor(private readonly commandBus: CommandBus) {}

    @Post()
    @UseInterceptors(StandardSchemaSerializerInterceptor)
    @SerializeOptions({ schema: rocketsAuthInvitationResponseSchema })
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
      standardSchema: rocketsAuthInvitationResponseSchema,
    })
    async create(
      @Body({ schema: rocketsAuthInvitationCreateSchema })
      body: InvitationCreateBody,
      @Req() req: Request,
    ): Promise<InvitationResponse> {
      const ctx = getAppContext(req);
      const invitation: Invitation = await this.commandBus.execute(
        new CreateInvitationByEmailCommand(ctx, body),
      );
      let emailError: string | undefined;
      try {
        await this.commandBus.execute(
          new SendInvitationCommand(ctx, invitation.id),
        );
        this.logger.log('Invitation sent successfully', {
          invitationId: invitation.id,
          email: body.email,
        });
      } catch (e) {
        emailError = e instanceof Error ? e.message : String(e);
        this.logger.error('Failed to send invitation', {
          invitationId: invitation.id,
          email: body.email,
          error: emailError,
        });
      }

      // `active` is an aggregate getter, not a prop — `toPlain()` omits it.
      return {
        ...invitation.toPlain(),
        active: invitation.active,
        emailSent: emailError === undefined,
        emailError,
      };
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
  @AuthPublic({ classLevel: true })
  @UseGuards(RateLimitGuard)
  // Body is `{ passcode, payload }` — no account field, so the fine
  // dimension keeps its per-IP default.
  @RateLimit({})
  @UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
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
      @Body({ schema: rocketsAuthInvitationAcceptSchema })
      body: InvitationAcceptBody,
      @Req() req: Request,
    ): Promise<void> {
      const ctx = getAppContext(req);
      const { passcode, payload } = body;
      const result: Invitation | null = await this.commandBus.execute(
        new AcceptInvitationCommand(ctx, code, { passcode, payload }),
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
  @UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
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
    async revoke(
      @Body({ schema: rocketsAuthInvitationRevokeSchema })
      body: InvitationRevokeBody,
      @Req() req: Request,
    ): Promise<void> {
      const ctx = getAppContext(req);
      await this.commandBus.execute(
        new RevokeInvitationsCommand(ctx, body.email, body.category),
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
  @UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
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
    async reattempt(
      @Param('code') code: string,
      @Req() req: Request,
    ): Promise<void> {
      const ctx = getAppContext(req);
      const invitation: Invitation | null = await this.queryBus.execute(
        new FindInvitationByCodeQuery(ctx, code),
      );
      if (!invitation) {
        throw new InvitationNotFoundException(code);
      }
      await this.commandBus.execute(
        new SendInvitationCommand(ctx, invitation.id),
      );
    }
  }

  applyControllerExtras(InvitationReattemptController, extras, {
    reattempt: 'reattempt',
  });
  return InvitationReattemptController;
}
