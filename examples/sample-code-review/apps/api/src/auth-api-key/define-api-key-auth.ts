import { defineModuleResource } from '@bitwild/rockets-core';
import type { AuthBootstrap } from '@bitwild/rockets-core';
import { ApiKeyAuthAdapter } from './api-key.adapter';
import { ApiKeyController } from './api-key.controller';
import { ApiKeyEntity } from './api-key.entity';

export const apiKeyAuthResource = defineModuleResource({
  entities: [ApiKeyEntity],
});

/**
 * API key auth chain entry. Pair with `apiKeyAuthResource` in `resources[]`.
 */
export function defineApiKeyAuth(): AuthBootstrap<ApiKeyAuthAdapter> {
  return {
    adapter: ApiKeyAuthAdapter,
    forRoot: () => ({
      module: class ApiKeyAuthHostModule {},
      providers: [ApiKeyAuthAdapter],
      controllers: [ApiKeyController],
      exports: [ApiKeyAuthAdapter],
    }),
  };
}
