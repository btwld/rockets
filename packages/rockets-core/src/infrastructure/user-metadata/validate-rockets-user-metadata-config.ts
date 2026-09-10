import { z } from 'zod';

import { assertNoHiddenFields } from '../../zod/zod-projections';
import { USER_METADATA_MANAGED_FIELDS } from '../../rockets-core.constants';
import type { RocketsUserMetadataConfig } from '../../domain/interfaces/rockets-user-metadata-config.interface';
import {
  assertFailClosedResponse,
  assertNamedSchema,
} from '../../common/utils/open-api-schema.util';

/**
 * Runtime checks for `extras.userMetadata` before wiring repositories and
 * the `/me` routes.
 */
export function validateRocketsUserMetadataConfig(
  config: RocketsUserMetadataConfig,
): void {
  if (!config.entity || typeof config.entity !== 'function') {
    throw new Error(
      'RocketsUserMetadataConfig: `entity` must be a class constructor.',
    );
  }
  assertNamedSchema(
    config.updateSchema,
    'RocketsUserMetadataConfig: `updateSchema`',
  );
  assertNamedSchema(
    config.responseSchema,
    'RocketsUserMetadataConfig: `responseSchema`',
  );
  assertFailClosedResponse(
    config.responseSchema,
    'RocketsUserMetadataConfig: `responseSchema`',
  );
  assertNoHiddenFields(
    config.responseSchema,
    'RocketsUserMetadataConfig: `responseSchema`',
  );
  assertNoManagedUpdateFields(config.updateSchema);
}

/**
 * A hand-written `updateSchema` is the documented alternative to
 * `defineZodUserMetadata`, and nothing kept it from declaring a column
 * the server owns. `id` is the sharp one: `PATCH /me` validates the body
 * against this schema and the payload reaches `repo.update(existing, …)`,
 * so an accepted `id` hands the store a foreign primary key. Rejected at
 * boot rather than stripped in silence — a schema that declares it is
 * describing a contract the server will not honour.
 */
function assertNoManagedUpdateFields(updateSchema: z.ZodType): void {
  if (!(updateSchema instanceof z.ZodObject)) return;
  const declared = USER_METADATA_MANAGED_FIELDS.filter(
    (field) => field in updateSchema.shape,
  );
  if (declared.length === 0) return;
  throw new Error(
    'RocketsUserMetadataConfig: `updateSchema` declares server-managed ' +
      `field(s) ${declared.join(', ')}, which \`PATCH /me\` never writes. ` +
      'Drop them with .omit({ ' +
      declared.map((field) => `${field}: true`).join(', ') +
      ' }) (then wrap LAST with withOpenApi()), or build the config with ' +
      'defineZodUserMetadata, which omits them for you.',
  );
}
