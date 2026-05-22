import { Injectable } from '@nestjs/common';
import type {
  GithubOAuthResult,
  GithubRepoInspection,
  GithubRepoSummary,
} from './github.types';

/** Used only when `GITHUB_USE_FAKE=true` (e2e). */
@Injectable()
export class GithubE2eFakeClient {
  exchangeCode(code: string): Promise<GithubOAuthResult> {
    if (code !== 'demo-github-code') {
      return Promise.reject(new Error('Invalid GitHub authorization code'));
    }
    return Promise.resolve({
      login: 'demo-reviewer',
      accessToken: 'gho_demo_access_token',
    });
  }

  listRepositories(_accessToken: string): Promise<GithubRepoSummary[]> {
    return Promise.resolve([
      {
        owner: 'btwld',
        name: 'rockets',
        fullName: 'btwld/rockets',
        defaultBranch: 'main',
        language: 'TypeScript',
        private: false,
      },
    ]);
  }

  inspectRepository(
    _accessToken: string,
    owner: string,
    repo: string,
  ): Promise<GithubRepoInspection> {
    return Promise.resolve({
      metadata: {
        fullName: `${owner}/${repo}`,
        description: 'E2E fixture repository',
        defaultBranch: 'main',
        language: 'TypeScript',
        stargazersCount: 1,
        openIssuesCount: 0,
        sizeKb: 100,
        pushedAt: new Date().toISOString(),
        topics: ['rockets'],
      },
      hasReadme: true,
      hasPackageJson: true,
      readmeExcerpt: '# Rockets',
      packageJsonKeys: ['name', 'dependencies'],
      sourceFiles: [
        {
          path: 'package.json',
          content: JSON.stringify({ name: 'rockets', scripts: { test: 'jest' } }),
        },
        {
          path: 'README.md',
          content: '# Rockets\n\nSDK monorepo.',
        },
      ],
      sourceFilesTruncated: false,
    });
  }
}
