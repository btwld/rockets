import {
  Body,
  Controller,
  Patch,
  Post,
  Type,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthPublic,
  AuthenticatedResponseInterface,
  AuthenticationResponseDto,
  IssueAuthenticatedResponseCommand,
} from '@concepta/nestjs-authentication';
import { OtpException } from '@concepta/nestjs-otp';

import { RocketsAuthOtpConfirmDto } from '../../../infrastructure/dto/rockets-auth-otp-confirm.dto';
import { RocketsAuthOtpSendDto } from '../../../infrastructure/dto/rockets-auth-otp-send.dto';
import { RocketsAuthOtpService } from '../../../infrastructure/services/rockets-auth-otp.service';
import { OtpControllerExtras } from '../../../interfaces/otp-controller-extras.interface';

/**
 * Build the OTP controller, applying any consumer-supplied
 * `extras.classDecorators`, `routes.send.decorators`, and
 * `routes.confirm.decorators`.
 *
 * Business logic lives in {@link RocketsAuthOtpService} (overrideable via
 * its per-method seams). To customise transport, swap the service via DI;
 * to add guards / throttling / ACL, append decorators via extras.
 */
export function buildRocketsAuthOtpController(
  extras: OtpControllerExtras = {},
): Type<unknown> {
  @Controller('otp')
  @AuthPublic()
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
    @ApiBody({
      type: RocketsAuthOtpSendDto,
      description: 'Email to receive the OTP',
      examples: {
        standard: {
          value: { email: 'user@example.com' },
          summary: 'Standard OTP request',
        },
      },
    })
    @ApiOkResponse({ description: 'OTP sent successfully' })
    @ApiBadRequestResponse({ description: 'Invalid email format' })
    @Throttle({ default: { limit: 3, ttl: 60000 } })
    @Post()
    async sendOtp(@Body() dto: RocketsAuthOtpSendDto): Promise<void> {
      return this.otpService.sendOtp(dto.email);
    }

    @ApiOperation({
      summary: 'Confirm OTP for a given email and passcode',
      description:
        'Validates the OTP passcode for the specified email and returns authentication tokens on success',
    })
    @ApiBody({
      type: RocketsAuthOtpConfirmDto,
      description: 'Email and passcode for OTP verification',
      examples: {
        standard: {
          value: { email: 'user@example.com', passcode: '123456' },
          summary: 'Standard OTP confirmation',
        },
      },
    })
    @ApiOkResponse({
      description: 'OTP confirmed successfully, authentication tokens provided',
      type: AuthenticationResponseDto,
    })
    @ApiBadRequestResponse({
      description: 'Invalid email format or missing required fields',
    })
    @ApiUnauthorizedResponse({
      description: 'Invalid OTP or expired passcode',
    })
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @Patch()
    async confirmOtp(
      @Body() dto: RocketsAuthOtpConfirmDto,
    ): Promise<AuthenticatedResponseInterface> {
      try {
        const user = await this.otpService.confirmOtp(dto.email, dto.passcode);
        return this.commandBus.execute(
          new IssueAuthenticatedResponseCommand({}, user.id),
        );
      } catch (error) {
        if (error instanceof OtpException) {
          throw new UnauthorizedException();
        }
        throw error;
      }
    }
  }

  applyExtras(RocketsAuthOtpController, extras);
  return RocketsAuthOtpController;
}

function applyExtras(
  controllerClass: Type<unknown>,
  extras: OtpControllerExtras,
): void {
  for (const decorator of extras.classDecorators ?? []) {
    decorator(controllerClass);
  }

  const routeMap: Record<string, string> = {
    send: 'sendOtp',
    confirm: 'confirmOtp',
  };

  for (const [routeKey, methodName] of Object.entries(routeMap)) {
    const cfg = extras.routes?.[routeKey as keyof typeof extras.routes];
    if (!cfg?.decorators) continue;

    const proto = controllerClass.prototype as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
    if (!descriptor) continue;

    for (const decorator of cfg.decorators) {
      decorator(proto, methodName, descriptor);
    }
  }
}
