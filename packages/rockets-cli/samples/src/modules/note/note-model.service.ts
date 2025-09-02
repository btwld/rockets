import { Injectable } from '@nestjs/common';
import { RepositoryInterface, ModelService, InjectDynamicRepository } from '@concepta/nestjs-common';
import { Not } from 'typeorm';
import { NoteEntityInterface, NoteCreatableInterface, NoteUpdatableInterface, NoteModelServiceInterface, NoteStatus } from './note.interface';
import { NoteCreateDto, NoteUpdateDto } from './note.dto';
import { NoteNotFoundException, NoteNameAlreadyExistsException } from './note.exception';

export const NOTE_MODULE_NOTE_ENTITY_KEY = 'note';

@Injectable()
export class NoteModelService
  extends ModelService<
    NoteEntityInterface,
    NoteCreatableInterface,
    NoteUpdatableInterface
  >
  implements NoteModelServiceInterface
{
  protected createDto = NoteCreateDto;
  protected updateDto = NoteUpdateDto;

  constructor(
    @InjectDynamicRepository(NOTE_MODULE_NOTE_ENTITY_KEY)
    repo: RepositoryInterface<NoteEntityInterface>,
  ) {
    super(repo);
  }

  async create(data: NoteCreatableInterface): Promise<NoteEntityInterface> {
    return super.create(data);
  }

  async update(data: NoteUpdatableInterface): Promise<NoteEntityInterface> {
    return super.update(data);
  }
}


