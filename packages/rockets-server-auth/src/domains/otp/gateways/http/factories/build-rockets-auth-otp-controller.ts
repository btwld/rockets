import {
  Body,
  Controller,
  Patch,
  Post,
  Req,
  StandardSchemaValidationPipe,
  UnauthorizedException,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RateLimit, RateLimitGuard } from '@concepta/rockets-core';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthPublic,
  IssueAuthenticatedResponseCommand,
  authenticationResponseSchema,
  type AuthenticatedResponseInterface,
} from '@concepta/nestjs-authentication';
import { OtpException } from '@concepta/nestjs-otp';
import { getAppContext, rocketsSchemaValidation } from '@concepta/rockets-core';
import type { Request } from 'express';
import type { z } from 'zod';

import { rocketsAuthOtpConfirmSchema } from '../../../infrastructure/schemas/rockets-auth-otp-confirm.schema';
import { rocketsAuthOtpSendSchema } from '../../../infrastructure/schemas/rockets-auth-otp-send.schema';
import { RocketsAuthOtpService } from '../../../infrastructure/services/rockets-auth-otp.service';
import type { OtpControllerExtras } from '../../../interfaces/otp-controller-extras.interface';
import { applyControllerExtras } from '../../../../../shared/utils/apply-controller-extras.helper';
import { authAccountRateLimitKey } from '../../../../../shared/throttling/auth-rate-limit-keys';

type OtpSendBody = z.output<typeof rocketsAuthOtpSendSchema>;
type OtpConfirmBody = z.output<typeof rocketsAuthOtpConfirmSchema>;

/** Build the OTP controller and apply consumer-supplied decorators. */
export function buildRocketsAuthOtpController(
  extras: OtpControllerExtras = {},
): Type<unknown> {
  @Controller('otp')
  @AuthPublic({ classLevel: true })
  @UseGuards(RateLimitGuard)
  @RateLimit({})
  @UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
  @ApiTags('Authentication')
  class RocketsAuthOtpController {
    constructor(
      private readonly commandBus: CommandBus,
      private readonly otpService: RocketsAuthOtpService,
    ) {}

    @ApiOperation({
      summary: 'Send OTP to the provided email',
      description:
        'Generates a one-time passcode and sends it to the specified email address',
    })
    @ApiOkResponse({ description: 'OTP sent successfully' })
    @ApiBadRequestResponse({ description: 'Invalid email format' })
    @RateLimit({
      default: {
        limit: 3,
        windowMs: 60000,
        key: authAccountRateLimitKey(['email']),
      },
    })
    @Post()
    async sendOtp(
      @Body({ schema: rocketsAuthOtpSendSchema }) body: OtpSendBody,
      @Req() req: Request,
    ): Promise<void> {
      const ctx = getAppContext(req);
      return this.otpService.sendOtp(ctx, body.email);
    }

    @ApiOperation({
      summary: 'Confirm OTP for a given email and passcode',
      description:
        'Validates the OTP passcode for the specified email and returns authentication tokens on success',
    })
    @ApiOkResponse({
      description: 'OTP confirmed successfully, authentication tokens provided',
      standardSchema: authenticationResponseSchema,
    })
    @ApiBadRequestResponse({
      description: 'Invalid email format or missing required fields',
    })
    @ApiUnauthorizedResponse({
      description: 'Invalid OTP or expired passcode',
    })
    @RateLimit({
      default: {
        limit: 5,
        windowMs: 60000,
        key: authAccountRateLimitKey(['email']),
      },
    })
    @Patch()
    async confirmOtp(
      @Body({ schema: rocketsAuthOtpConfirmSchema }) body: OtpConfirmBody,
      @Req() req: Request,
    ): Promise<AuthenticatedResponseInterface> {
      const ctx = getAppContext(req);
      try {
        const user = await this.otpService.confirmOtp(
          ctx,
          body.email,
          body.passcode,
        );
        return this.commandBus.execute(
          new IssueAuthenticatedResponseCommand(ctx, user.id),
        );
      } catch (error) {
        if (error instanceof OtpException) {
          throw new UnauthorizedException();
        }
        throw error;
      }
    }
  }

  applyControllerExtras(RocketsAuthOtpController, extras, {
    send: 'sendOtp',
    confirm: 'confirmOtp',
  });
  return RocketsAuthOtpController;
}
