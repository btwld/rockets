import {
  BadRequestException,
  HttpException,
  Injectable,
  type PlainLiteralObject,
} from '@nestjs/common';
import {
  CrudAdapter,
  CrudCommandHandler,
  CrudCreateCommand,
  CrudQueryException,
  InjectCrudAdapter,
} from '@bitwild/rockets-crud';
import {
  InjectDynamicRepository,
  type RepositoryInterface,
  Where,
} from '@bitwild/rockets-repository';
import { PetTagEntity } from './pet-tag.entity';
import { TagEntity } from '../tag/tag.entity';

type PetTagCreatePayload = PlainLiteralObject & {
  tagId?: string;
};

/**
 * Pre-flight existence check for the `tagId` foreign key before the
 * adapter attempts the junction insert. Without this, an unknown tag id
 * surfaces as a downstream FK violation wrapped in `CrudQueryException`
 * (500). Surfacing it as `BadRequestException` (400) with a descriptive
 * message is the contract the public API documents.
 */
@Injectable()
export class PetTagCreateHandler extends CrudCommandHandler<PlainLiteralObject> {
  constructor(
    @InjectCrudAdapter(PetTagEntity)
    readonly crudAdapter: CrudAdapter<PlainLiteralObject>,
    @InjectDynamicRepository(TagEntity)
    private readonly tagRepo: RepositoryInterface<TagEntity>,
  ) {
    super(crudAdapter);
  }

  async execute(
    command: CrudCreateCommand<PlainLiteralObject, PetTagCreatePayload>,
  ): Promise<PlainLiteralObject> {
    const { context, dto } = command;

    try {
      const tagId = dto.tagId;
      if (typeof tagId === 'string' && tagId.length > 0) {
        const existing = await this.tagRepo.findOne({
          where: Where.eq<TagEntity>('id', tagId),
        });
        if (!existing) {
          throw new BadRequestException(`Unknown tag id: ${tagId}`);
        }
      }

      return await this.crudAdapter.create(context, dto);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new CrudQueryException(this.crudAdapter.entityName(), {
        originalError: e,
      });
    }
  }
}
