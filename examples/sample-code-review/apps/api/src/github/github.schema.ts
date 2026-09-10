import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';

export const githubConnectSchema = withOpenApi(
  z.object({
    code: z.string().min(1).meta({
      description: 'Authorization code from GitHub redirect (?code=)',
    }),
  }),
  'GithubConnectDto',
);
export type GithubConnectBody = z.output<typeof githubConnectSchema>;

export const githubOAuthUrlResponseSchema = withOpenApi(
  z.object({
    authorizeUrl: z.string().meta({
      description: 'Open this URL in the browser to authorize GitHub',
    }),
    state: z
      .string()
      .meta({ description: 'Opaque state — validated on callback' }),
  }),
  'GithubOAuthUrlResponseDto',
);
export type GithubOAuthUrlResponse = z.output<
  typeof githubOAuthUrlResponseSchema
>;

export const githubConnectionResponseSchema = withOpenApi(
  z.object({
    githubLogin: z.string(),
    connected: z.boolean(),
  }),
  'GithubConnectionResponseDto',
);
export type GithubConnectionResponse = z.output<
  typeof githubConnectionResponseSchema
>;

export const githubRepoResponseSchema = withOpenApi(
  z.object({
    owner: z.string(),
    name: z.string(),
    fullName: z.string(),
    defaultBranch: z.string(),
    language: z.string().optional(),
    private: z.boolean(),
  }),
  'GithubRepoResponseDto',
);
export type GithubRepoResponse = z.output<typeof githubRepoResponseSchema>;

/**
 * Swagger-only: `@ApiResponse({ standardSchema })` ignores `isArray`, so the
 * list route documents an unnamed bridged array whose items `$ref` the
 * named component. Serialization uses the item schema — the serializer
 * interceptor maps arrays per item.
 */
export const githubRepoListResponseSchema = withOpenApi(
  z.array(githubRepoResponseSchema),
);
