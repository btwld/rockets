import {
  AuthLocalGuard,
  AuthLocalIssueTokenService,
} from '@concepta/nestjs-auth-local';
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RocketsServerAuthJwtResponseDto } from '../../dto/auth/rockets-server-auth-jwt-response.dto';
import { RocketsServerAuthLoginDto } from '../../dto/auth/rockets-server-auth-login.dto';
import { RocketsServerAuthAuthenticationResponseInterface } from '../../interfaces/common/rockets-server-auth-authentication-response.interface';
import { RocketsServerAuthUserInterface } from '../../interfaces/user/rockets-server-auth-user.interface';

/**
 * Controller for password-based authentication
 * Handles user login with username/email and password
 */
@Controller('token/password')
@UseGuards(AuthLocalGuard)
@AuthPublic()
@ApiTags('auth')
export class AuthPasswordController {
  constructor(
    @Inject(AuthLocalIssueTokenService)
    private issueTokenService: IssueTokenServiceInterface,
  ) {}

  @ApiOperation({
    summary: 'Authenticate with username/email and password',
    description:
      'Validates credentials and returns authentication tokens on success',
  })
  @ApiBody({
    type: RocketsServerAuthLoginDto,
    description: 'User credentials',
    examples: {
      standard: {
        value: {
          username: 'user@example.com',
          password: 'StrongP@ssw0rd',
        },
        summary: 'Standard login request',
      },
    },
  })
  @ApiOkResponse({
    type: RocketsServerAuthJwtResponseDto,
    description: 'Authentication successful, tokens provided',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or inactive account',
  })
  @HttpCode(200)
  @Post()
  async login(
    @AuthUser() user: RocketsServerAuthUserInterface,
  ): Promise<RocketsServerAuthAuthenticationResponseInterface> {
    return this.issueTokenService.responsePayload(user.id);
  }
}
