export interface GithubRepoSummary {
  readonly owner: string;
  readonly name: string;
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly language: string;
  readonly private: boolean;
}

export interface GithubOAuthResult {
  readonly login: string;
  readonly accessToken: string;
}

export interface GithubRepoMetadata {
  readonly fullName: string;
  readonly description: string | null;
  readonly defaultBranch: string;
  readonly language: string | null;
  readonly stargazersCount: number;
  readonly openIssuesCount: number;
  readonly sizeKb: number;
  readonly pushedAt: string | null;
  readonly topics: readonly string[];
}

export interface GithubSourceFile {
  readonly path: string;
  readonly content: string;
}

export interface GithubRepoInspection {
  readonly metadata: GithubRepoMetadata;
  readonly hasReadme: boolean;
  readonly hasPackageJson: boolean;
  readonly readmeExcerpt: string | null;
  readonly packageJsonKeys: readonly string[];
  readonly sourceFiles: readonly GithubSourceFile[];
  readonly sourceFilesTruncated: boolean;
}
