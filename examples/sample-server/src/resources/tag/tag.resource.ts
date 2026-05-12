import { defineResource } from '@bitwild/rockets';
import { TagEntity } from './tag.entity';
import { TagCreateDto, TagResponseDto, TagUpdateDto } from './tag.dto';

/**
 * Shared global catalog — no owner scoping. The tag↔pet relation is
 * managed through the explicit junction resource at
 * `/pets/:petId/tags` (`PetTagEntity`); this resource only owns the
 * tag catalog itself.
 */
export const tagResource = defineResource({
  entity: TagEntity,
  // key / path / tags omitted — derived from `TagEntity` →
  // `'tag'` → `tags` / `['Tags']`.
  operations: {
    list: { response: TagResponseDto },
    read: { response: TagResponseDto },
    create: { body: TagCreateDto, response: TagResponseDto },
    update: { body: TagUpdateDto, response: TagResponseDto },
  },
});
