import { z } from 'zod';
import { withOpenApi } from '@concepta/rockets-core';

export const createApiKeySchema = withOpenApi(
  z.object({
    name: z
      .string()
      .max(100)
      .meta({
        example: 'CI pipeline',
        description: 'Human-readable label to identify this key later.',
      })
      .optional(),
  }),
  'CreateApiKeyDto',
);
export type CreateApiKeyBody = z.output<typeof createApiKeySchema>;

// Shared shape, bridged separately below: `withOpenApi` must be the LAST
// call, so the create response extends the bare object, not the named one.
const apiKeyResponseFields = z.object({
  id: z.uuid(),
  keyPrefix: z.string().meta({
    description: 'First 8 characters of the key — used to identify it.',
    example: 'a1b2c3d4',
  }),
  // Nullable columns: a key created without `name` / never used reads
  // back as `null`.
  name: z.string().meta({ example: 'CI pipeline' }).nullable().optional(),
  lastUsedAt: z.date().nullable().optional(),
  dateCreated: z.date(),
});

export const apiKeyResponseSchema = withOpenApi(
  apiKeyResponseFields,
  'ApiKeyResponseDto',
);
export type ApiKeyResponse = z.output<typeof apiKeyResponseSchema>;

export const createApiKeyResponseSchema = withOpenApi(
  apiKeyResponseFields.extend({
    key: z.string().meta({
      description:
        'Full key value — shown ONCE. Store it securely; it cannot be retrieved again.',
      example: 'a1b2c3d4e5f6...',
    }),
  }),
  'CreateApiKeyResponseDto',
);
export type CreateApiKeyResponse = z.output<typeof createApiKeyResponseSchema>;

/**
 * Swagger-only: `@ApiResponse({ standardSchema })` ignores `isArray`, so the
 * list route documents an unnamed bridged array whose items `$ref` the
 * named component. Serialization uses the item schema — the serializer
 * interceptor maps arrays per item.
 */
export const apiKeyListResponseSchema = withOpenApi(
  z.array(apiKeyResponseSchema),
);
