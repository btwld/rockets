import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { CrudService, CrudRequestInterface } from '@concepta/nestjs-crud';
import { BookEntityInterface, BookStatus } from './book.interface';
import { BookTypeOrmCrudAdapter } from './book-typeorm-crud.adapter';
import { BookModelService } from './book-model.service';
import { BookDto, BookCreateDto, BookUpdateDto } from './book.dto';
import { BookException, BookNotFoundException, BookNameAlreadyExistsException } from './book.exception';

@Injectable()
export class BookCrudService extends CrudService<BookEntityInterface> {
  constructor(
    @Inject(BookTypeOrmCrudAdapter)
    protected readonly crudAdapter: BookTypeOrmCrudAdapter,
    private readonly modelService: BookModelService,
  ) {
    super(crudAdapter);
  }

  async createOne(
    req: CrudRequestInterface<BookEntityInterface>,
    dto: BookCreateDto,
    queryOptions?: Record<string, unknown>,
  ): Promise<BookEntityInterface> {
    try {
      const isUnique = await this.modelService.isNameUnique(dto.name);
      if (!isUnique) throw new BookNameAlreadyExistsException();
      const data = { ...dto, status: dto.status || BookStatus.ACTIVE };
      return await super.createOne(req, data, queryOptions);
    } catch (error) {
      if (error instanceof BookException) throw error;
      throw new InternalServerErrorException('Failed to create', { cause: error });
    }
  }
}


