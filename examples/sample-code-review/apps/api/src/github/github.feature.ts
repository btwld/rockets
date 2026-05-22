import { Provider } from '@nestjs/common';
import { defineModuleResource } from '@bitwild/rockets-core';

import { GithubConfig } from '../config/github.config';
import { GithubApiClient } from './github-api.client';
import { GithubE2eFakeClient } from './github-e2e-fake.client';
import { GITHUB_API_CLIENT } from './github-client.token';
import { GithubConnectionEntity } from './github-connection.entity';
import { GithubController } from './github.controller';
import { GithubOAuthStateService } from './github-oauth-state.service';
import { GithubService } from './github.service';

function githubApiClientProvider(): Provider {
  if (process.env.GITHUB_USE_FAKE === 'true') {
    return {
      provide: GITHUB_API_CLIENT,
      useClass: GithubE2eFakeClient,
    };
  }
  return {
    provide: GITHUB_API_CLIENT,
    useClass: GithubApiClient,
  };
}

export const githubFeature = defineModuleResource({
  entities: [GithubConnectionEntity],
  controllers: [GithubController],
  providers: [
    GithubConfig,
    GithubOAuthStateService,
    githubApiClientProvider(),
    GithubService,
  ],
  exports: [GithubService, GITHUB_API_CLIENT],
});
