import { defineAuthFeature } from '@bitwild/rockets-core';
import type { AuthFeatureBundle } from '@bitwild/rockets-core';
import { ApiKeyAuthAdapter } from './api-key.adapter';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyEntity } from './api-key.entity';

/**
 * Auth feature bundle that enables API key authentication.
 *
 * Wire alongside your primary adapter in `RocketsModule.forRoot`:
 * ```ts
 * auth: [defineFirebaseAuth(), defineApiKeyAuth()]
 * ```
 *
 * Clients authenticate by sending the `X-API-Key` header.
 * Manage keys via the `/api-keys` endpoints.
 */
export function defineApiKeyAuth(): AuthFeatureBundle<ApiKeyAuthAdapter> {
  return defineAuthFeature({
    entities: [ApiKeyEntity],
    adapter: ApiKeyAuthAdapter,
    controllers: [ApiKeyController],
  });
}
