import { Injectable, type PlainLiteralObject } from '@nestjs/common';
import type { CrudContextInterface } from '@bitwild/rockets-crud';
import {
  InjectDynamicRepository,
  RepositoryInterface,
} from '@bitwild/rockets-repository';
import { PetTagEntity } from './pet-tag.entity';
import { PET_TAG_ENTITY_KEY } from './pet-tag.constants';

/**
 * Keeps `pet_tag` junction rows aligned with a desired tag-id list using
 * only the dynamic repository (no TypeORM `DataSource` / `QueryBuilder`).
 *
 * Rationale (same as before): TypeORM `merge + save` on `@ManyToMany` is
 * additive — it never removes junction rows. We compute a minimal add/remove
 * diff so we only touch rows that actually need to change (avoids UNIQUE
 * violations on SQLite when re-adding unchanged pairs).
 *
 * The first argument is the CRUD command context (`CrudContextInterface`),
 * i.e. what `CrudUpdateCommand.context` carries. Upstream `AppContextInterface`
 * is only the overlay-helper surface (`require`, `with`, …) and is not the
 * static type of that field, so we type this entry point as CRUD context. It
 * remains a `PlainLiteralObject`, which matches repository `{ ctx }` options.
 */
@Injectable()
export class PetTagSyncer {
  constructor(
    @InjectDynamicRepository(PET_TAG_ENTITY_KEY)
    private readonly petTagRepo: RepositoryInterface<PetTagEntity>,
  ) {}

  async sync(
    ctx: CrudContextInterface<PlainLiteralObject>,
    petId: string,
    nextTagIds: readonly string[],
    currentTags: readonly { id: string }[] | undefined,
  ): Promise<void> {
    const currentIds = new Set((currentTags ?? []).map((t) => t.id));
    const requestedIds = new Set(nextTagIds);

    const toAdd = nextTagIds.filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !requestedIds.has(id));

    if (toAdd.length === 0 && toRemove.length === 0) return;

    if (toRemove.length > 0) {
      const rows: PetTagEntity[] = toRemove.map((tagId) => {
        const row = new PetTagEntity();
        row.petId = petId;
        row.tagId = tagId;
        return row;
      });
      await this.petTagRepo.deleteMany(rows, { ctx });
    }

    if (toAdd.length > 0) {
      await this.petTagRepo.createMany(
        toAdd.map((tagId) => ({ petId, tagId })),
        { ctx },
      );
    }
  }
}
