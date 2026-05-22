import { Injectable } from '@nestjs/common';

export interface GithubConfigValues {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly oauthCallbackUrl: string;
  readonly oauthScopes: string;
  readonly appPublicUrl: string;
}

@Injectable()
export class GithubConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly oauthCallbackUrl: string;
  readonly oauthScopes: string;
  readonly appPublicUrl: string;

  constructor() {
    const clientId = process.env.GITHUB_CLIENT_ID?.trim();
    const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
    const oauthCallbackUrl = process.env.GITHUB_OAUTH_CALLBACK_URL?.trim();

    if (!clientId || !clientSecret || !oauthCallbackUrl) {
      throw new Error(
        'Missing GitHub OAuth env. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ' +
          'and GITHUB_OAUTH_CALLBACK_URL (see examples/sample-code-review/.env.example).',
      );
    }

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.oauthCallbackUrl = oauthCallbackUrl;
    this.oauthScopes =
      process.env.GITHUB_OAUTH_SCOPES?.trim() ?? 'read:user repo';
    this.appPublicUrl =
      process.env.APP_PUBLIC_URL?.trim() ?? 'http://localhost:3001';
  }

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.oauthCallbackUrl,
      scope: this.oauthScopes,
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }
}
