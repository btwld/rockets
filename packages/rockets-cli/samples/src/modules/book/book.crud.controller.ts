import { ApiTags } from '@nestjs/swagger';
import { AccessControlCreateMany, AccessControlCreateOne, AccessControlDeleteOne, AccessControlQuery, AccessControlReadMany, AccessControlReadOne, AccessControlRecoverOne, AccessControlUpdateOne } from '@concepta/nestjs-access-control';
import { CrudBody, CrudCreateMany, CrudCreateOne, CrudController, CrudControllerInterface, CrudDeleteOne, CrudReadMany, CrudReadOne, CrudRecoverOne, CrudRequest, CrudRequestInterface, CrudUpdateOne } from '@concepta/nestjs-crud';
import { BookCreateDto, BookCreateManyDto, BookDto, BookPaginatedDto, BookUpdateDto } from './book.dto';
import { BookAccessQueryService } from './book-access-query.service';
import { BookResource } from './book.types';
import { BookCrudService } from './book.crud.service';
import { BookCreatableInterface, BookEntityInterface, BookUpdatableInterface } from './book.interface';

@CrudController({ path: 'books', model: { type: BookDto, paginatedType: BookPaginatedDto } })
@AccessControlQuery({ service: BookAccessQueryService })
@ApiTags('books')
export class BookCrudController implements CrudControllerInterface<BookEntityInterface, BookCreatableInterface, BookUpdatableInterface> {
  constructor(private service: BookCrudService) {}

  @CrudReadMany()
  @AccessControlReadMany(BookResource.Many)
  async getMany(@CrudRequest() req: CrudRequestInterface<BookEntityInterface>) {
    return this.service.getMany(req);
  }

  @CrudReadOne()
  @AccessControlReadOne(BookResource.One)
  async getOne(@CrudRequest() req: CrudRequestInterface<BookEntityInterface>) {
    return this.service.getOne(req);
  }

  @CrudCreateMany()
  @AccessControlCreateMany(BookResource.Many)
  async createMany(@CrudRequest() req: CrudRequestInterface<BookEntityInterface>, @CrudBody() dto: BookCreateManyDto) {
    return this.service.createMany(req, dto);
  }

  @CrudCreateOne({ dto: BookCreateDto })
  @AccessControlCreateOne(BookResource.One)
  async createOne(@CrudRequest() req: CrudRequestInterface<BookEntityInterface>, @CrudBody() dto: BookCreateDto) {
    return this.service.createOne(req, dto);
  }

  @CrudUpdateOne()
  @AccessControlUpdateOne(BookResource.One)
  async updateOne(@CrudRequest() req: CrudRequestInterface<BookEntityInterface>, @CrudBody() dto: BookUpdateDto) {
    return this.service.updateOne(req, dto);
  }

  @CrudDeleteOne()
  @AccessControlDeleteOne(BookResource.One)
  async deleteOne(@CrudRequest() req: CrudRequestInterface<BookEntityInterface>) {
    return this.service.deleteOne(req);
  }

  @CrudRecoverOne()
  @AccessControlRecoverOne(BookResource.One)
  async recoverOne(@CrudRequest() req: CrudRequestInterface<BookEntityInterface>) {
    return this.service.recoverOne(req);
  }
}


