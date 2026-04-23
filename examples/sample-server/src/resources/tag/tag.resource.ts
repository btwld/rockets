import { defineResource } from '@bitwild/rockets';
import { TagEntity } from './tag.entity';
import { TagCreateDto, TagResponseDto, TagUpdateDto } from './tag.dto';
import { TAG_ENTITY_KEY } from './tag.constants';

/**
 * Shared global catalog — no owner scoping. Authorization for tag use
 * happens on the Pet side.
 */
export const tagResource = defineResource({
  key: TAG_ENTITY_KEY,
  entity: TagEntity,
  path: 'tags',
  tags: ['Tags'],
  dto: {
    response: TagResponseDto,
    create: TagCreateDto,
    update: TagUpdateDto,
  },
});

export function createTagResource(): typeof tagResource {
  return tagResource;
}
