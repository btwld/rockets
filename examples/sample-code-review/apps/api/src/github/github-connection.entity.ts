import { z } from 'zod';
import { f, rocketsFieldMeta } from '@bitwild/rockets-zod';
import { zodEntityCompiler } from '../zod-bindings';

export const githubConnectionSchema = z.object({
  id: f.pk(),
  /** Firebase `uid` / `AuthorizedUser.id`. */
  userId: f.string({ max: 128, unique: true }),
  githubLogin: f.string({ max: 128 }),
  accessToken: f.string({ text: true }),
  dateCreated: z.date().register(rocketsFieldMeta, { db: { createdAt: true } }),
  dateUpdated: z.date().register(rocketsFieldMeta, { db: { updatedAt: true } }),
});

export const GithubConnectionEntity = zodEntityCompiler.compileEntity(
  githubConnectionSchema,
  { name: 'GithubConnectionEntity', table: 'github_connections' },
);
/** Persistence row type — shares the name with the entity class (value + type). */
export type GithubConnectionEntity = z.infer<typeof githubConnectionSchema>;
