import { defineResource } from '@bitwild/rockets';
import { TagEntity } from './tag.entity';
import { PetEntity } from '../pet/pet.entity';
import { TagCreateDto, TagResponseDto, TagUpdateDto } from './tag.dto';
import { TAG_ENTITY_KEY } from './tag.constants';

/**
 * Shared global catalog — no owner scoping. Authorization for tag use
 * happens on the Pet side.
 *
 * The `relation()` helper declares the inverse of `PetEntity.tags`
 * (M:N). The lazy `() => PetEntity` thunk avoids a load-order cycle
 * between `pet.entity.ts` and `tag.entity.ts`. `include: 'never'` keeps
 * the `pets` collection registered for cross-resource validation but
 * off the controller surface — clients query pets-by-tag via `/pets`.
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
  relations: (relation) => [
    relation(() => PetEntity, 'pets', { include: 'never' }),
  ],
});
