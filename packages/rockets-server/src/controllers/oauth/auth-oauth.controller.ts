import { Controller, Inject, Get, UseGuards, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags, ApiQuery, ApiResponse } from '@nestjs/swagger';
import {
  AuthenticatedUserInterface,
  AuthenticationResponseInterface,
} from '@concepta/nestjs-common';
import {
  AuthUser,
  IssueTokenServiceInterface,
  AuthenticationJwtResponseDto,
  AuthPublic,
  IssueTokenService,
} from '@concepta/nestjs-authentication';
import { OAuthGuard } from '@concepta/nestjs-oauth';

/**
 * OAuth controller following the OpenAPI specification
 *
 * This controller handles OAuth flows according to the specification:
 * - /oauth/authorize: Redirects to external OAuth provider
 * - /oauth/callback: Handles OAuth callback and errors
 *
 * Flow:
 * - Client calls /oauth/authorize?provider=google&scopes=email profile to be redirected to the provider's login page
 * - After authorization, the user is redirected to the callback URL defined in the provider config
 * - The /oauth/callback URL is called with the authorization code or error parameters
 * - The code is used to get the access token and user profile from the provider
 * - The user profile is used to create a new user or return the existing user from federated module
 * - The user is authenticated and a token is issued
 * - The token is returned to the client
 *
 * Supported providers: google, apple, github (configurable)
 */
@Controller('oauth')
@UseGuards(OAuthGuard)
@AuthPublic()
@ApiTags('oauth')
export class AuthOAuthController {
  constructor(
    // TODO: define where to get it from, a issue token only for oauth?
    @Inject(IssueTokenService)
    private issueTokenService: IssueTokenServiceInterface,
  ) {}

  /**
   * OAuth Authorize - redirects to provider-specific OAuth login
   * Matches /oauth/authorize endpoint from OpenAPI spec
   */
  @ApiResponse({
    status: 302,
    description:
      "HTTP Redirect to the OAuth identity provider's authorization URL.",
    headers: {
      Location: {
        description:
          'URL to which the user agent should redirect (or open in a browser for mobile apps).',
        schema: {
          type: 'string',
          format: 'uri',
        },
      },
    },
  })
  @ApiQuery({
    name: 'provider',
    description:
      'Name of the OAuth provider. Supported providers: google, github, apple',
    example: 'google',
    required: true,
    schema: {
      type: 'string',
      enum: ['google', 'github', 'apple'],
    },
  })
  @ApiQuery({
    name: 'scopes',
    required: true,
    description:
      'Space separated list of OAuth scopes to pass on to the provider. Common scopes: email, profile, openid',
    example: 'email profile',
    schema: {
      type: 'string',
      pattern: '[^ ]+( +[^ ]+)*',
    },
  })
  @Get('authorize')
  authorize(): void {
    // The OAuthGuard will handle routing to the appropriate provider guard
    // based on the provider query parameter and redirect to the OAuth provider
    return;
  }

  /**
   * OAuth Callback - handles the OAuth callback from the provider
   * Matches /oauth/callback endpoint from OpenAPI spec
   */
  @ApiOkResponse({
    type: AuthenticationJwtResponseDto,
    description: 'DTO containing an access token and a refresh token.',
  })
  @Get('callback')
  async callback(
    @AuthUser() user: AuthenticatedUserInterface,
  ): Promise<AuthenticationResponseInterface> {
    return this.issueTokenService.responsePayload(user.id);
  }

  /**
   * OAuth Callback POST - handles the OAuth callback from the provider (POST method)
   * Matches /oauth/callback POST endpoint from OpenAPI spec
   */
  @ApiOkResponse({
    type: AuthenticationJwtResponseDto,
    description: 'DTO containing an access token and a refresh token.',
  })
  @Post('callback')
  async callbackPost(
    @AuthUser() user: AuthenticatedUserInterface,
  ): Promise<AuthenticationResponseInterface> {
    return this.issueTokenService.responsePayload(user.id);
  }
}
