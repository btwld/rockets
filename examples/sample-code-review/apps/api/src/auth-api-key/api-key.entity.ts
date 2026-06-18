import { z } from 'zod';
import { f, rocketsFieldMeta } from '@bitwild/rockets-zod';
import { zodEntityCompiler } from '../zod-bindings';

/**
 * API keys for programmatic access (e.g., CI/CD pipelines). Zod-sourced —
 * the schema is the single source for the entity columns and the row type.
 *
 * ⚠️ SAMPLE CODE — in production, store a bcrypt/argon2 hash of the
 * key rather than plaintext, and compare with the library's verify
 * function (constant-time). Only reveal the raw key once, at creation.
 */
export const apiKeySchema = z.object({
  id: f.pk(),
  /** Raw key value — shown once at creation, then only the prefix is exposed. */
  key: f.string({ max: 64, unique: true }),
  /** ID of the owning user (maps to the Firebase uid via UserEntity). */
  userId: f.string({ max: 255 }),
  /** Human-readable label so users can identify which key is which. */
  name: f.string({ max: 100 }).optional(),
  lastUsedAt: z.date().optional(),
  dateCreated: z.date().register(rocketsFieldMeta, { db: { createdAt: true } }),
});

export const ApiKeyEntity = zodEntityCompiler.compileEntity(apiKeySchema, {
  name: 'ApiKeyEntity',
  table: 'api_keys',
});
/** Persistence row type — shares the name with the entity class (value + type). */
export type ApiKeyEntity = z.infer<typeof apiKeySchema>;
