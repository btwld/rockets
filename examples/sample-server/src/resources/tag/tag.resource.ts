import { defineResource } from '@bitwild/rockets';
import { TagEntity } from './tag.entity';
import { TagCreateDto, TagResponseDto, TagUpdateDto } from './tag.dto';
import { TAG_ENTITY_KEY } from './tag.constants';

/**
 * Shared global catalog — no owner scoping. The tag↔pet relation is
 * managed through the explicit junction resource at
 * `/pets/:petId/tags` (`PetTagEntity`); this resource only owns the
 * tag catalog itself.
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
