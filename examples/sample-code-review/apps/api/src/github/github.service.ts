import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import type { AppContextInterface } from '@bitwild/rockets-common';
import { GithubConfig } from '../config/github.config';
import { GithubConnectionEntity } from './github-connection.entity';
import { GithubOAuthStateService } from './github-oauth-state.service';
import {
  GITHUB_API_CLIENT,
  type GithubApiClientInterface,
} from './github-client.token';
import type {
  GithubRepoInspection,
  GithubRepoSummary,
} from './github.types';

@Injectable()
export class GithubService {
  constructor(
    @InjectDynamicRepository('githubConnection')
    private readonly connections: RepositoryInterface<GithubConnectionEntity>,
    @Inject(GITHUB_API_CLIENT)
    private readonly githubClient: GithubApiClientInterface,
    private readonly oauthState: GithubOAuthStateService,
    private readonly config: GithubConfig,
  ) {}

  startOAuth(userId: string): { authorizeUrl: string; state: string } {
    const state = this.oauthState.create(userId);
    return {
      state,
      authorizeUrl: this.config.buildAuthorizeUrl(state),
    };
  }

  async connectWithOAuthCallback(
    ctx: AppContextInterface,
    state: string,
    code: string,
  ): Promise<GithubConnectionEntity> {
    const userId = this.oauthState.consume(state);
    return this.connect(ctx, userId, code);
  }

  async connect(
    ctx: AppContextInterface,
    userId: string,
    code: string,
  ): Promise<GithubConnectionEntity> {
    const oauth = await this.githubClient.exchangeCode(code);
    const existing = await this.connections.findOne({
      ctx,
      where: Where.eq<GithubConnectionEntity>('userId', userId),
    });

    if (existing) {
      return this.connections.update(
        existing,
        {
          githubLogin: oauth.login,
          accessToken: oauth.accessToken,
        },
        { ctx },
      );
    }

    return this.connections.create(
      {
        userId,
        githubLogin: oauth.login,
        accessToken: oauth.accessToken,
      },
      { ctx },
    );
  }

  async getConnection(
    ctx: AppContextInterface,
    userId: string,
  ): Promise<GithubConnectionEntity> {
    const row = await this.connections.findOne({
      ctx,
      where: Where.eq<GithubConnectionEntity>('userId', userId),
    });
    if (!row) {
      throw new NotFoundException(
        'GitHub is not connected. GET /github/oauth/url then complete OAuth.',
      );
    }
    return row;
  }

  async listRepositories(
    ctx: AppContextInterface,
    userId: string,
  ): Promise<GithubRepoSummary[]> {
    const connection = await this.getConnection(ctx, userId);
    return this.githubClient.listRepositories(connection.accessToken);
  }

  async inspectRepository(
    ctx: AppContextInterface,
    userId: string,
    owner: string,
    repo: string,
  ): Promise<GithubRepoInspection> {
    const { accessToken } = await this.requireAccessToken(ctx, userId);
    return this.githubClient.inspectRepository(accessToken, owner, repo);
  }

  async requireAccessToken(
    ctx: AppContextInterface,
    userId: string,
  ): Promise<{ connection: GithubConnectionEntity; accessToken: string }> {
    const connection = await this.getConnection(ctx, userId);
    if (!connection.accessToken) {
      throw new ConflictException('GitHub connection has no access token');
    }
    return { connection, accessToken: connection.accessToken };
  }
}
