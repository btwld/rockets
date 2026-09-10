import { assertNoHiddenFields } from '../../../zod/zod-projections';
import type { CrudResponseConfig } from '@concepta/nestjs-crud';
import type { ResourceDtoConfig } from '../../../domain/interfaces/rockets-resource-definition.interface';
import {
  assertFailClosedResponse,
  assertNamedSchema,
  buildPaginatedSchema,
} from '../../../common/utils/open-api-schema.util';

export function buildResponse(
  resourceKey: string,
  dto: ResourceDtoConfig,
  override: CrudResponseConfig | undefined,
): CrudResponseConfig | undefined {
  const resource = override?.resource ?? dto.response;
  if (!resource) return override;

  const context = `defineResource(${resourceKey}): dto.response`;
  assertNamedSchema(resource, context);
  assertFailClosedResponse(resource, context);
  assertNoHiddenFields(resource, context);

  const paginated =
    override?.paginated ??
    dto.paginated ??
    buildPaginatedSchema(resource, context);
  const paginatedContext = `defineResource(${resourceKey}): dto.paginated`;
  assertNamedSchema(paginated, paginatedContext);
  assertFailClosedResponse(paginated, paginatedContext);
  assertNoHiddenFields(paginated, paginatedContext);
  const collection = override?.collection;

  const built: CrudResponseConfig = {
    resource,
    paginated,
    ...(collection !== undefined && { collection }),
    ...(override?.returnDeleted !== undefined && {
      returnDeleted: override.returnDeleted,
    }),
    ...(override?.returnRestored !== undefined && {
      returnRestored: override.returnRestored,
    }),
    ...(override?.serialization !== undefined && {
      serialization: override.serialization,
    }),
  };

  return built;
}
