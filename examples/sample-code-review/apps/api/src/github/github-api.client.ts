import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { GithubConfig } from '../config/github.config';
import type {
  GithubOAuthResult,
  GithubRepoInspection,
  GithubRepoMetadata,
  GithubRepoSummary,
  GithubSourceFile,
} from './github.types';

const REVIEW_MAX_FILES = Number(process.env.OPENAI_REVIEW_MAX_FILES ?? '15');
const REVIEW_MAX_TOTAL_CHARS = Number(
  process.env.OPENAI_REVIEW_MAX_CHARS ?? '80000',
);
const REVIEW_MAX_FILE_CHARS = Number(
  process.env.OPENAI_REVIEW_MAX_FILE_CHARS ?? '8000',
);

const SOURCE_FILE_PATTERN =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|cs|rb|php|vue|md)$/i;

const SKIP_PATH_PATTERN =
  /(?:^|\/)(node_modules|dist|coverage|\.git|vendor|build|out|\.next|\.turbo|graphify-out)(?:\/|$)/i;

interface GithubOAuthTokenResponse {
  readonly access_token?: string;
  readonly error?: string;
  readonly error_description?: string;
}

interface GithubUserResponse {
  readonly login: string;
}

interface GithubRepoApiItem {
  readonly name: string;
  readonly full_name: string;
  readonly private: boolean;
  readonly default_branch?: string;
  readonly language?: string | null;
  readonly owner: { readonly login: string };
}

interface GithubRepoDetailResponse {
  readonly full_name: string;
  readonly description: string | null;
  readonly default_branch: string;
  readonly language: string | null;
  readonly stargazers_count: number;
  readonly open_issues_count: number;
  readonly size: number;
  readonly pushed_at: string | null;
  readonly topics?: string[];
}

interface GithubContentItem {
  readonly name: string;
  readonly type: string;
  readonly content?: string;
  readonly encoding?: string;
}

interface GithubBranchResponse {
  readonly commit: {
    readonly commit: { readonly tree: { readonly sha: string } };
  };
}

interface GithubTreeItem {
  readonly path: string;
  readonly type: string;
  readonly size?: number;
}

interface GithubTreeResponse {
  readonly tree: GithubTreeItem[];
  readonly truncated: boolean;
}

@Injectable()
export class GithubApiClient {
  constructor(private readonly config: GithubConfig) {}

  async exchangeCode(code: string): Promise<GithubOAuthResult> {
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: this.config.oauthCallbackUrl,
    });

    const response = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );

    const payload = (await response.json()) as GithubOAuthTokenResponse;
    if (!response.ok || payload.error || !payload.access_token) {
      throw new BadRequestException(
        payload.error_description ??
          payload.error ??
          'GitHub OAuth token exchange failed',
      );
    }

    const login = await this.fetchLogin(payload.access_token);
    return { login, accessToken: payload.access_token };
  }

  async listRepositories(accessToken: string): Promise<GithubRepoSummary[]> {
    const repos: GithubRepoApiItem[] = [];
    let page = 1;

    while (page <= 5) {
      const batch = await this.githubGet<GithubRepoApiItem[]>(
        accessToken,
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`,
      );
      if (batch.length === 0) {
        break;
      }
      repos.push(...batch);
      if (batch.length < 100) {
        break;
      }
      page += 1;
    }

    return repos.map((repo) => ({
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch ?? 'main',
      language: repo.language ?? 'unknown',
      private: repo.private,
    }));
  }

  async inspectRepository(
    accessToken: string,
    owner: string,
    repo: string,
  ): Promise<GithubRepoInspection> {
    const metadata = await this.fetchRepoMetadata(accessToken, owner, repo);
    const branch = metadata.defaultBranch;

    const readme = await this.tryFetchFileContent(
      accessToken,
      owner,
      repo,
      'README.md',
      branch,
    );
    const packageJson = await this.tryFetchFileContent(
      accessToken,
      owner,
      repo,
      'package.json',
      branch,
    );

    let packageJsonKeys: string[] = [];
    if (packageJson) {
      try {
        const parsed = JSON.parse(packageJson) as Record<string, unknown>;
        packageJsonKeys = Object.keys(parsed);
      } catch {
        packageJsonKeys = [];
      }
    }

    const { files, truncated } = await this.fetchSourceFiles(
      accessToken,
      owner,
      repo,
      branch,
    );

    return {
      metadata,
      hasReadme: readme !== null,
      hasPackageJson: packageJson !== null,
      readmeExcerpt: readme ? readme.slice(0, 500) : null,
      packageJsonKeys,
      sourceFiles: files,
      sourceFilesTruncated: truncated,
    };
  }

  private async fetchSourceFiles(
    accessToken: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<{ files: GithubSourceFile[]; truncated: boolean }> {
    const branchInfo = await this.githubGet<GithubBranchResponse>(
      accessToken,
      `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    );
    const treeSha = branchInfo.commit.commit.tree.sha;

    const tree = await this.githubGet<GithubTreeResponse>(
      accessToken,
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    );

    const candidates = tree.tree
      .filter(
        (item) =>
          item.type === 'blob' &&
          SOURCE_FILE_PATTERN.test(item.path) &&
          !SKIP_PATH_PATTERN.test(item.path) &&
          (item.size === undefined || item.size <= 120_000),
      )
      .sort((a, b) => a.path.localeCompare(b.path));

    const files: GithubSourceFile[] = [];
    let totalChars = 0;
    let truncated = tree.truncated;

    for (const item of candidates) {
      if (files.length >= REVIEW_MAX_FILES) {
        truncated = true;
        break;
      }
      if (totalChars >= REVIEW_MAX_TOTAL_CHARS) {
        truncated = true;
        break;
      }

      const raw = await this.tryFetchFileContent(
        accessToken,
        owner,
        repo,
        item.path,
        branch,
      );
      if (!raw) {
        continue;
      }

      const content = raw.slice(0, REVIEW_MAX_FILE_CHARS);
      if (totalChars + content.length > REVIEW_MAX_TOTAL_CHARS) {
        truncated = true;
        break;
      }

      files.push({ path: item.path, content });
      totalChars += content.length;
    }

    return { files, truncated };
  }

  private async fetchRepoMetadata(
    accessToken: string,
    owner: string,
    repo: string,
  ): Promise<GithubRepoMetadata> {
    const detail = await this.githubGet<GithubRepoDetailResponse>(
      accessToken,
      `https://api.github.com/repos/${owner}/${repo}`,
    );

    return {
      fullName: detail.full_name,
      description: detail.description,
      defaultBranch: detail.default_branch,
      language: detail.language,
      stargazersCount: detail.stargazers_count,
      openIssuesCount: detail.open_issues_count,
      sizeKb: detail.size,
      pushedAt: detail.pushed_at,
      topics: detail.topics ?? [],
    };
  }

  private async tryFetchFileContent(
    accessToken: string,
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null> {
    try {
      const item = await this.githubGet<GithubContentItem>(
        accessToken,
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      );
      if (item.type !== 'file' || !item.content || item.encoding !== 'base64') {
        return null;
      }
      return Buffer.from(item.content, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }

  private async fetchLogin(accessToken: string): Promise<string> {
    const user = await this.githubGet<GithubUserResponse>(
      accessToken,
      'https://api.github.com/user',
    );
    return user.login;
  }

  private async githubGet<T>(accessToken: string, url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 401) {
      throw new UnauthorizedException(
        'GitHub token rejected — reconnect via /github/oauth/url',
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new BadRequestException(
        `GitHub API ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    return (await response.json()) as T;
  }
}
