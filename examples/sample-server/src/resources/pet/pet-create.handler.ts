import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  PlainLiteralObject,
} from '@nestjs/common';
import {
  CrudAdapter,
  CrudCreateCommand,
  InjectCrudAdapter,
} from '@bitwild/rockets-crud';
import { CrudCommandHandler } from '@bitwild/rockets-crud';
import { EventBus } from '@nestjs/cqrs';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { isUUID } from 'class-validator';
import { PetEntity } from './pet.entity';
import { PET_ENTITY_KEY } from './pet.constants';
import { PetCreatedEvent } from '../../events/pet-created.event';
import { requireAuthUser, wrapCrudErrors } from '../shared';

type PetCreatePayload = PlainLiteralObject & {
  userId?: string;
  tagIds?: string[];
  tags?: Array<{ id: string }>;
};

/**
 * Stamps `userId` from the authenticated user (never trusts the client),
 * translates `tagIds: string[]` into the TypeORM cascade association,
 * re-fetches so eager relations populate the response, then publishes a
 * `PetCreatedEvent` for listeners (e.g. welcome email).
 */
@Injectable()
export class PetCreateHandler extends CrudCommandHandler<PlainLiteralObject> {
  constructor(
    @InjectCrudAdapter(PET_ENTITY_KEY)
    readonly crudAdapter: CrudAdapter<PlainLiteralObject>,
    @InjectDynamicRepository(PET_ENTITY_KEY)
    private readonly petRepo: RepositoryInterface<PetEntity>,
    private readonly eventBus: EventBus,
  ) {
    super(crudAdapter);
  }

  async execute(
    command: CrudCreateCommand<PlainLiteralObject, PetCreatePayload>,
  ): Promise<PlainLiteralObject> {
    const { context, dto } = command;

    const authUser = requireAuthUser(context, 'create a pet');

    const requestedUserId = dto.userId;
    if (requestedUserId !== undefined && requestedUserId !== '') {
      if (!isUUID(requestedUserId)) {
        throw new BadRequestException('userId must be a valid UUID v4');
      }
      if (requestedUserId !== authUser.id) {
        throw new ForbiddenException('userId must match the authenticated user');
      }
    }

    const petData: PetCreatePayload = { ...dto, userId: authUser.id };
    if (Array.isArray(petData.tagIds)) {
      petData.tags = petData.tagIds.map((id) => ({ id }));
      delete petData.tagIds;
    }

    return wrapCrudErrors(this.crudAdapter, async () => {
      const created = await this.crudAdapter.create(context, petData);
      // `save()` returns what you passed in; eager joins only fire on
      // `find`, so we re-fetch to populate `tags` and `vaccinations` on
      // the response.
      const full = await this.petRepo.findOne({
        where: Where.eq<PetEntity>('id', created.id as string),
        ctx: context,
      });
      const result = full ?? created;

      this.eventBus.publish(
        new PetCreatedEvent(
          result.id as string,
          (result.userId as string) ?? authUser.id,
          (result.name as string) ?? '',
        ),
      );

      return result;
    });
  }
}
