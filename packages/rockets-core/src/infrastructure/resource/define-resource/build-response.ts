import type { CrudResponseConfig } from '@bitwild/rockets-crud';
import type { ResourceDtoConfig } from '../../../domain/interfaces/rockets-resource-definition.interface';
import { createPaginatedDto } from '../paginated-dto.factory';

export function buildResponse(
  dto: ResourceDtoConfig,
  override: CrudResponseConfig | undefined,
): CrudResponseConfig | undefined {
  const resource = override?.resource ?? dto.response;
  if (!resource) return override;

  const paginated =
    override?.paginated ?? dto.paginated ?? createPaginatedDto(resource);
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
