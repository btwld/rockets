import {
  AuthPublic,
  AuthenticatedResponseInterface,
  AuthenticationResponseDto,
  IssueAuthenticatedResponseCommand,
  LocalGuard,
  LocalLoginDto,
  RefreshDto,
  RefreshGuard,
} from '@concepta/nestjs-authentication';
import { ReferenceIdInterface } from '@bitwild/rockets-app';
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';

type RequestWithPassportUser = Request & {
  readonly user?: ReferenceIdInterface;
};

/**
 * Password and refresh-token HTTP endpoints. Concepta v8 registers strategies
 * and CQRS handlers in {@link AuthenticationModule}; the routes themselves are
 * composed here (same pattern as {@link RocketsAuthOtpController}).
 *
 * Uses `req.user` after passport guards (not `@AuthUser()`, which resolves
 * before `AuthUserContextOverlay` runs on some Nest versions).
 */
@Controller('token')
@AuthPublic()
@ApiTags('Authentication')
export class RocketsAuthTokenController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('password')
  @HttpCode(200)
  @UseGuards(LocalGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Issue tokens with username and password',
    description:
      'Validates credentials with the local strategy and returns access and refresh JWTs.',
  })
  @ApiBody({
    type: LocalLoginDto,
    examples: {
      standard: {
        value: { username: 'user@example.com', password: 'StrongP@ssw0rd' },
        summary: 'Username + password',
      },
    },
  })
  @ApiOkResponse({
    description: 'Tokens issued',
    type: AuthenticationResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async loginWithPassword(
    @Body() _loginBody: LocalLoginDto,
    @Req() req: RequestWithPassportUser,
  ): Promise<AuthenticatedResponseInterface> {
    const user = req.user;
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return this.commandBus.execute(
      new IssueAuthenticatedResponseCommand({}, user.id),
    );
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(RefreshGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Accepts a refresh token (body.refreshToken), validates it, and returns a new token pair.',
  })
  @ApiBody({
    type: RefreshDto,
    examples: {
      standard: {
        value: { refreshToken: '<jwt>' },
        summary: 'Refresh JWT from prior login',
      },
    },
  })
  @ApiOkResponse({
    description: 'Tokens issued',
    type: AuthenticationResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  async refreshTokens(
    @Body() _dto: RefreshDto,
    @Req() req: RequestWithPassportUser,
  ): Promise<AuthenticatedResponseInterface> {
    const user = req.user;
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return this.commandBus.execute(
      new IssueAuthenticatedResponseCommand({}, user.id),
    );
  }
}
