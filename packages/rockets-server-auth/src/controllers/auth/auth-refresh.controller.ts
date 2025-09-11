import {
  AuthRefreshGuard,
  AuthRefreshIssueTokenService,
} from '@concepta/nestjs-auth-refresh';
import {
  AuthPublic,
  AuthUser,
  IssueTokenServiceInterface,
} from '@concepta/nestjs-authentication';
import { Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RocketsServerAuthJwtResponseDto } from '../../dto/auth/rockets-server-auth-jwt-response.dto';
import { RocketsServerAuthRefreshDto } from '../../dto/auth/rockets-server-auth-refresh.dto';
import { RocketsServerAuthAuthenticationResponseInterface } from '../../interfaces/common/rockets-server-auth-authentication-response.interface';
import { RocketsServerAuthUserInterface } from '../../interfaces/user/rockets-server-auth-user.interface';

/**
 * Controller for JWT refresh token operations
 * Allows users to obtain a new access token using their refresh token
 */
@Controller('token/refresh')
@UseGuards(AuthRefreshGuard)
@AuthPublic()
@ApiTags('auth')
@ApiSecurity('bearer')
export class AuthTokenRefreshController {
  constructor(
    @Inject(AuthRefreshIssueTokenService)
    private issueTokenService: IssueTokenServiceInterface,
  ) {}

  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Generates a new access token using a valid refresh token',
  })
  @ApiBody({
    type: RocketsServerAuthRefreshDto,
    description: 'Refresh token information',
    examples: {
      standard: {
        value: {
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        summary: 'Standard refresh token request',
      },
    },
  })
  @ApiOkResponse({
    type: RocketsServerAuthJwtResponseDto,
    description: 'New access and refresh tokens',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired refresh token',
  })
  @Post()
  @HttpCode(200)
  async refresh(
    @AuthUser() user: RocketsServerAuthUserInterface,
  ): Promise<RocketsServerAuthAuthenticationResponseInterface> {
    return this.issueTokenService.responsePayload(user.id);
  }
}
