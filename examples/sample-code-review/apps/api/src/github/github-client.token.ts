export const GITHUB_API_CLIENT = Symbol('GITHUB_API_CLIENT');

export interface GithubApiClientInterface {
  exchangeCode(code: string): Promise<import('./github.types').GithubOAuthResult>;
  listRepositories(
    accessToken: string,
  ): Promise<import('./github.types').GithubRepoSummary[]>;
  inspectRepository(
    accessToken: string,
    owner: string,
    repo: string,
  ): Promise<import('./github.types').GithubRepoInspection>;
}
