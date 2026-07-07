import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Header,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthPublic } from '@bitwild/rockets';
import { Ctx, type AppContextInterface } from '@concepta/nestjs-core';
import type { AuthorizedUser } from '@bitwild/rockets';
import { GithubConfig } from '../config/github.config';
import {
  GithubConnectDto,
  GithubConnectionResponseDto,
  GithubOAuthUrlResponseDto,
  GithubRepoResponseDto,
} from './github.dto';
import { GithubService } from './github.service';
import { AuthUser } from '@bitwild/rockets-core';

@ApiTags('GitHub')
@Controller('github')
export class GithubController {
  constructor(
    private readonly githubService: GithubService,
    private readonly config: GithubConfig,
  ) {}

  @Get('oauth/url')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Start GitHub OAuth — open authorizeUrl in browser (requires Firebase token)',
  })
  oauthUrl(
    @AuthUser() user: AuthorizedUser,
  ): GithubOAuthUrlResponseDto {
    const { authorizeUrl, state } = this.githubService.startOAuth(user.id);
    return { authorizeUrl, state };
  }

  @Get('oauth/callback')
  @AuthPublic()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({
    summary:
      'GitHub OAuth redirect target (register this URL in your GitHub OAuth App)',
  })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: true })
  async oauthCallback(
    @Ctx() ctx: AppContextInterface,
    @Query('code') code: string,
    @Query('state') state: string,
  ): Promise<string> {
    const connection = await this.githubService.connectWithOAuthCallback(
      ctx,
      state,
      code,
    );

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>GitHub connected</title></head>
<body style="font-family:system-ui;max-width:40rem;margin:2rem auto">
  <h1>GitHub connected</h1>
  <p>Account <strong>${connection.githubLogin}</strong> is linked to your Firebase user.</p>
  <ol>
    <li>Call <code>GET ${this.config.appPublicUrl}/github/repos</code> with your Firebase Bearer token.</li>
    <li>Call <code>POST ${this.config.appPublicUrl}/analysis/review</code> with <code>{"owner":"...","repo":"..."}</code>.</li>
    <li>Open Swagger: <a href="${this.config.appPublicUrl}/api">${this.config.appPublicUrl}/api</a></li>
  </ol>
</body></html>`;

    return html;
  }

  @Post('connect')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Exchange GitHub OAuth code (SPA flow — same code from callback query)',
  })
  async connect(
    @Ctx() ctx: AppContextInterface,
    @AuthUser() user: AuthorizedUser,
    @Body() dto: GithubConnectDto,
  ): Promise<GithubConnectionResponseDto> {
    const row = await this.githubService.connect(ctx, user.id, dto.code);
    return {
      githubLogin: row.githubLogin,
      connected: true,
    };
  }

  @Get('connection')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current GitHub connection status' })
  async connection(
    @Ctx() ctx: AppContextInterface,
    @AuthUser() user: AuthorizedUser,
  ): Promise<GithubConnectionResponseDto> {
    const row = await this.githubService.getConnection(ctx, user.id);
    return {
      githubLogin: row.githubLogin,
      connected: true,
    };
  }

  @Get('repos')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List repositories from your GitHub account' })
  async repos(
    @Ctx() ctx: AppContextInterface,
    @AuthUser() user: AuthorizedUser,
  ): Promise<GithubRepoResponseDto[]> {
    const repos = await this.githubService.listRepositories(ctx, user.id);
    return repos.map((r) => ({
      owner: r.owner,
      name: r.name,
      fullName: r.fullName,
      defaultBranch: r.defaultBranch,
      language: r.language,
      private: r.private,
    }));
  }
}
