import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CrudService, CrudRequestInterface } from '@concepta/nestjs-crud';
import { NoteEntityInterface, NoteStatus } from './note.interface';
import { NoteTypeOrmCrudAdapter } from './note-typeorm-crud.adapter';
import { NoteModelService } from './note-model.service';
import { NoteDto, NoteCreateDto, NoteUpdateDto } from './note.dto';
import { NoteException, NoteNotFoundException, NoteNameAlreadyExistsException } from './note.exception';

@Injectable()
export class NoteCrudService extends CrudService<NoteEntityInterface> {
  constructor(
    @Inject(NoteTypeOrmCrudAdapter)
    protected readonly crudAdapter: NoteTypeOrmCrudAdapter,
    private readonly modelService: NoteModelService,
  ) {
    super(crudAdapter);
  }

  async createOne(
    req: CrudRequestInterface<NoteEntityInterface>,
    dto: NoteCreateDto,
    queryOptions?: Record<string, unknown>,
  ): Promise<NoteEntityInterface> {
    try {
      const isUnique = await this.modelService.isNameUnique(dto.name);
      if (!isUnique) throw new NoteNameAlreadyExistsException();
      const data = { ...dto, status: dto.status || NoteStatus.ACTIVE };
      return await super.createOne(req, data, queryOptions);
    } catch (error) {
      if (error instanceof NoteException) throw error;
      throw new InternalServerErrorException('Failed to create', { cause: error });
    }
  }
}


