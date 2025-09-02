import { ApiTags } from '@nestjs/swagger';
import { AccessControlCreateMany, AccessControlCreateOne, AccessControlDeleteOne, AccessControlQuery, AccessControlReadMany, AccessControlReadOne, AccessControlRecoverOne, AccessControlUpdateOne } from '@concepta/nestjs-access-control';
import { CrudBody, CrudCreateMany, CrudCreateOne, CrudController, CrudControllerInterface, CrudDeleteOne, CrudReadMany, CrudReadOne, CrudRecoverOne, CrudRequest, CrudRequestInterface, CrudUpdateOne } from '@concepta/nestjs-crud';
import { NoteCreateDto, NoteCreateManyDto, NoteDto, NotePaginatedDto, NoteUpdateDto } from './note.dto';
import { NoteAccessQueryService } from './note-access-query.service';
import { NoteResource } from './note.types';
import { NoteCrudService } from './note.crud.service';
import { NoteCreatableInterface, NoteEntityInterface, NoteUpdatableInterface } from './note.interface';

@CrudController({ path: 'notes', model: { type: NoteDto, paginatedType: NotePaginatedDto } })
@AccessControlQuery({ service: NoteAccessQueryService })
@ApiTags('notes')
export class NoteCrudController implements CrudControllerInterface<NoteEntityInterface, NoteCreatableInterface, NoteUpdatableInterface> {
  constructor(private service: NoteCrudService) {}

  @CrudReadMany()
  @AccessControlReadMany(NoteResource.Many)
  async getMany(@CrudRequest() req: CrudRequestInterface<NoteEntityInterface>) {
    return this.service.getMany(req);
  }

  @CrudReadOne()
  @AccessControlReadOne(NoteResource.One)
  async getOne(@CrudRequest() req: CrudRequestInterface<NoteEntityInterface>) {
    return this.service.getOne(req);
  }

  @CrudCreateMany()
  @AccessControlCreateMany(NoteResource.Many)
  async createMany(@CrudRequest() req: CrudRequestInterface<NoteEntityInterface>, @CrudBody() dto: NoteCreateManyDto) {
    return this.service.createMany(req, dto);
  }

  @CrudCreateOne({ dto: NoteCreateDto })
  @AccessControlCreateOne(NoteResource.One)
  async createOne(@CrudRequest() req: CrudRequestInterface<NoteEntityInterface>, @CrudBody() dto: NoteCreateDto) {
    return this.service.createOne(req, dto);
  }

  @CrudUpdateOne()
  @AccessControlUpdateOne(NoteResource.One)
  async updateOne(@CrudRequest() req: CrudRequestInterface<NoteEntityInterface>, @CrudBody() dto: NoteUpdateDto) {
    return this.service.updateOne(req, dto);
  }

  @CrudDeleteOne()
  @AccessControlDeleteOne(NoteResource.One)
  async deleteOne(@CrudRequest() req: CrudRequestInterface<NoteEntityInterface>) {
    return this.service.deleteOne(req);
  }

  @CrudRecoverOne()
  @AccessControlRecoverOne(NoteResource.One)
  async recoverOne(@CrudRequest() req: CrudRequestInterface<NoteEntityInterface>) {
    return this.service.recoverOne(req);
  }
}


