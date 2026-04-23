import { Injectable, PlainLiteralObject } from '@nestjs/common';
import {
  CrudAdapter,
  CrudCommandHandler,
  CrudUpdateCommand,
  InjectCrudAdapter,
} from '@bitwild/rockets-crud';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { PetEntity } from './pet.entity';
import { PET_ENTITY_KEY } from './pet.constants';
import { PetTagSyncer } from './pet-tag.syncer';
import { requireAuthUser, wrapCrudErrors } from '../shared';

type PetUpdatePayload = PlainLiteralObject & {
  tagIds?: string[];
};

@Injectable()
export class PetUpdateHandler extends CrudCommandHandler<PlainLiteralObject> {
  constructor(
    @InjectCrudAdapter(PET_ENTITY_KEY)
    readonly crudAdapter: CrudAdapter<PlainLiteralObject>,
    @InjectDynamicRepository(PET_ENTITY_KEY)
    private readonly petRepo: RepositoryInterface<PetEntity>,
    private readonly petTagSyncer: PetTagSyncer,
  ) {
    super(crudAdapter);
  }

  async execute(
    command: CrudUpdateCommand<PlainLiteralObject, PetUpdatePayload>,
  ): Promise<PlainLiteralObject> {
    const { context, dto } = command;
    requireAuthUser(context, 'update a pet');

    const { tagIds, ...scalarDto } = dto;

    return wrapCrudErrors(this.crudAdapter, async () => {
      const updated = await this.crudAdapter.update(context, scalarDto);

      if (Array.isArray(tagIds)) {
        await this.petTagSyncer.sync(
          context,
          updated.id as string,
          tagIds,
          updated.tags as { id: string }[] | undefined,
        );
      }

      // Re-fetch so the response carries the fully-eager-loaded tags
      // (post-sync) and vaccinations.
      const full = await this.petRepo.findOne({
        where: Where.eq<PetEntity>('id', updated.id as string),
        ctx: context,
      });
      return full ?? updated;
    });
  }
}
