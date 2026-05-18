// TODO(upstream: concepta/nestjs-auth-apple|github|google) — re-enable this
// controller when v8 OAuth provider packages ship.
//
// As of @concepta/nestjs-authentication@8.0.0-alpha.5, the v7 OAuth provider
// packages (`nestjs-auth-apple`, `nestjs-auth-github`, `nestjs-auth-google`)
// have HARD `dependencies` on `@concepta/nestjs-authentication@^7.0.0-alpha.10`.
// Installing them alongside v8 produces two parallel `nestjs-authentication`
// trees in node_modules with separate guard/strategy registries, so the v8
// `AuthRouterGuard` cannot dispatch to v7-registered providers at runtime.
//
// Until upstream publishes v8 of those three OAuth provider packages, the
// entire OAuth flow is parked. The original implementation is preserved
// below in a block comment for fast restore once the upstream blocker
// clears. To re-enable:
//
//  1. Restore the imports + class body below.
//  2. Update the imports: replace `IssueTokenService`/`IssueTokenServiceInterface`
//     with the v8 equivalents (the v8 module dispatches via
//     `IssueAccessTokenCommand` / `IssueAuthenticatedResponseCommand`).
//     Replace `AuthenticationJwtResponseDto` with `AuthenticationResponseDto`.
//     Source `AuthenticatedUserInterface` from
//     `@concepta/nestjs-authentication` (it lives there in v8) instead of
//     `@concepta/nestjs-common`.
//     `AuthRouterGuard` is exported from `@concepta/nestjs-authentication` v8.
//  3. Re-add `AuthOAuthController` to `module-definition`'s controllers list.
//  4. Re-export from `domains/oauth/index.ts`.
//  5. Restore the controller in `examples/sample-server-auth` if needed.

export {};

/* original implementation kept verbatim for restoration ---

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
import { AuthRouterGuard } from '@concepta/nestjs-auth-router';

@Controller('oauth')
@UseGuards(AuthRouterGuard)
@AuthPublic()
@ApiTags('Authentication')
export class AuthOAuthController {
  constructor(
    @Inject(IssueTokenService)
    private issueTokenService: IssueTokenServiceInterface,
  ) {}

  @ApiResponse({
    status: 302,
    description:
      "HTTP Redirect to the OAuth identity provider's authorization URL.",
    headers: {
      Location: {
        description:
          'URL to which the user agent should redirect (or open in a browser for mobile apps).',
        schema: { type: 'string', format: 'uri' },
      },
    },
  })
  @ApiQuery({
    name: 'provider',
    description:
      'Name of the OAuth provider. Supported providers: google, github, apple',
    example: 'google',
    required: true,
    schema: { type: 'string', enum: ['google', 'github', 'apple'] },
  })
  @ApiQuery({
    name: 'scopes',
    required: true,
    description:
      'Space-separated list of OAuth scopes to pass on to the provider. Common scopes: email, profile, openid.',
    example: 'email profile',
    schema: { type: 'string', pattern: '[^ ]+( +[^ ]+)*' },
  })
  @Get('authorize')
  authorize(): void { return; }

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
--- end original implementation */
