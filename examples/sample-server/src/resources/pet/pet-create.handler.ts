import {
  ConflictException,
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
import { PetEntity } from './pet.entity';

type PetCreatePayload = PlainLiteralObject & {
  uniqueRef?: string;
};

@Injectable()
export class PetCreateHandler extends CrudCommandHandler<PlainLiteralObject> {
  constructor(
    @InjectCrudAdapter(PetEntity)
    readonly crudAdapter: CrudAdapter<PlainLiteralObject>,
    @InjectDynamicRepository(PetEntity)
    private readonly petRepo: RepositoryInterface<PetEntity>,
  ) {
    super(crudAdapter);
  }

  async execute(
    command: CrudCreateCommand<PlainLiteralObject, PetCreatePayload>,
  ): Promise<PlainLiteralObject> {
    const { context, dto } = command;

    try {
      const raw = dto.uniqueRef;
      const uniqueRef = typeof raw === 'string' ? raw.trim() : undefined;

      if (uniqueRef) {
        const existing = await this.petRepo.findOne({
          where: Where.eq<PetEntity>('uniqueRef', uniqueRef),
          ctx: context,
        });

        if (existing) {
          throw new ConflictException(
            `Pet uniqueRef "${uniqueRef}" is already in use`,
          );
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
