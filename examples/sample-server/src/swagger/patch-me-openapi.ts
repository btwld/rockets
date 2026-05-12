import { getSchemaPath } from '@nestjs/swagger';
import type { Type } from '@nestjs/common';

/**
 * Overrides PATCH `/me` requestBody so `userMetadata` matches the app-registered
 * `UserMetadataUpdateDto` instead of the generic `Record<string, unknown>` from
 * rockets-core `UserUpdateDto`.
 *
 * `extraModels` for `metadataDto` must be passed to `SwaggerModule.createDocument`.
 */
export function patchMePatchOpenApi<T>(
  document: unknown,
  metadataDto: Type<T>,
): void {
  if (!document || typeof document !== 'object') return;
  const doc = document as Record<string, unknown>;
  const paths = doc.paths as Record<string, unknown> | undefined;
  if (!paths) return;

  const me = paths['/me'];
  if (!me || typeof me !== 'object' || !('patch' in me)) return;

  const patchOp = me.patch;
  if (
    !patchOp ||
    typeof patchOp !== 'object' ||
    !('requestBody' in patchOp) ||
    !patchOp.requestBody
  ) {
    return;
  }

  const rb = patchOp.requestBody;
  if (typeof rb !== 'object' || !('content' in rb) || !rb.content) return;

  const content = rb.content as Record<string, unknown>;
  const json = content['application/json'] as
    | Record<string, unknown>
    | undefined;
  if (!json || typeof json !== 'object') return;

  json.schema = {
    type: 'object',
    properties: {
      userMetadata: { $ref: getSchemaPath(metadataDto) },
    },
  };
}
