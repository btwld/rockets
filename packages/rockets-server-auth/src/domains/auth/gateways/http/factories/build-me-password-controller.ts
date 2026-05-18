import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Patch,
  Req,
  Type,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthUser, JwtGuard } from '@concepta/nestjs-authentication';
import { getAppContext } from '@concepta/nestjs-common';
import type { Request } from 'express';

import { ChangeMyPasswordCommand } from '../../../application/commands/impl/change-my-password.command';
import { RocketsAuthChangePasswordDto } from '../../../infrastructure/dto/rockets-auth-change-password.dto';
import { MePasswordControllerExtras } from '../../../interfaces/me-password-controller-extras.interface';
import { RocketsAuthUserInterface } from '../../../../user/interfaces/rockets-auth-user.interface';
/**
 * Build the `MePassword` HTTP controller, applying any consumer-supplied
 * `extras.classDecorators` and `extras.routes.changePassword.decorators`.
 *
 * The controller delegates to {@link ChangeMyPasswordCommand} via
 * `CommandBus`. To customise behavior (filters, side effects, persistence),
 * subclass `AbstractChangeMyPasswordHandler` and register the override —
 * do NOT replace the controller.
 */
export function buildMePasswordController(
  extras: MePasswordControllerExtras = {},
): Type<unknown> {
  @Controller('me')
  @ApiTags('Me')
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  class MePasswordController {
    private readonly logger = new Logger(MePasswordController.name);

    constructor(private readonly commandBus: CommandBus) {}

    @Patch('password')
    @HttpCode(200)
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    @ApiOperation({
      summary: 'Change password',
      description:
        'Allows authenticated user to change their own password by providing current and new password',
      operationId: 'changeMyPassword',
    })
    @ApiBody({
      type: RocketsAuthChangePasswordDto,
      description: 'Current and new password',
      examples: {
        standard: {
          value: {
            currentPassword: 'CurrentP@ssw0rd',
            newPassword: 'NewSecureP@ssw0rd',
          },
          summary: 'Standard password change',
        },
      },
    })
    @ApiOkResponse({ description: 'Password changed successfully' })
    @ApiUnauthorizedResponse({
      description: 'Invalid current password or authentication token',
    })
    @ApiBadRequestResponse({
      description: 'New password does not meet requirements',
    })
    async changePassword(
      @AuthUser() user: RocketsAuthUserInterface,
      @Body() dto: RocketsAuthChangePasswordDto,
      @Req() req: Request,
    ): Promise<void> {
      const ctx = getAppContext(req);
      await this.commandBus.execute(
        new ChangeMyPasswordCommand(
          ctx,
          user.id,
          dto.currentPassword,
          dto.newPassword,
        ),
      );
    }
  }

  applyExtras(MePasswordController, extras);
  return MePasswordController;
}

/**
 * Apply consumer-supplied decorators to the built controller. Stays
 * private to this factory — every domain has its own factory + a copy of
 * this helper to avoid coupling factories to a shared file (§2.8 keeps
 * factories self-contained for clarity).
 */
function applyExtras(
  controllerClass: Type<unknown>,
  extras: MePasswordControllerExtras,
): void {
  for (const decorator of extras.classDecorators ?? []) {
    decorator(controllerClass);
  }

  const routeMap: Record<keyof NonNullable<typeof extras.routes>, string> = {
    changePassword: 'changePassword',
  };

  for (const [routeKey, methodName] of Object.entries(routeMap) as Array<
    [keyof typeof routeMap, string]
  >) {
    const cfg = extras.routes?.[routeKey];
    if (!cfg?.decorators) continue;

    const proto = controllerClass.prototype as Record<string, unknown>;
    const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
    if (!descriptor) continue;

    for (const decorator of cfg.decorators) {
      decorator(proto, methodName, descriptor);
    }
  }
}
