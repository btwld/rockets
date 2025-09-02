import { Injectable } from '@nestjs/common';
import { RepositoryInterface, ModelService, InjectDynamicRepository } from '@concepta/nestjs-common';
import { Not } from 'typeorm';
import { BookEntityInterface, BookCreatableInterface, BookUpdatableInterface, BookModelServiceInterface, BookStatus } from './book.interface';
import { BookCreateDto, BookUpdateDto } from './book.dto';
import { BookNotFoundException, BookNameAlreadyExistsException } from './book.exception';

export const BOOK_MODULE_BOOK_ENTITY_KEY = 'book';

@Injectable()
export class BookModelService
  extends ModelService<
    BookEntityInterface,
    BookCreatableInterface,
    BookUpdatableInterface
  >
  implements BookModelServiceInterface
{
  protected createDto = BookCreateDto;
  protected updateDto = BookUpdateDto;

  constructor(
    @InjectDynamicRepository(BOOK_MODULE_BOOK_ENTITY_KEY)
    repo: RepositoryInterface<BookEntityInterface>,
  ) {
    super(repo);
  }

  async findByName(name: string): Promise<BookEntityInterface | null> {
    return this.repo.findOne({ where: { name } });
  }

  async isNameUnique(name: string, excludeId?: string): Promise<boolean> {
    const whereCondition: any = { name };
    if (excludeId) whereCondition.id = Not(excludeId);
    const existing = await this.repo.findOne({ where: whereCondition });
    return !existing;
  }

  async getActiveBooks(): Promise<BookEntityInterface[]> {
    return this.repo.find({ where: { status: BookStatus.ACTIVE }, order: { name: 'ASC' } });
  }

  async create(data: BookCreatableInterface): Promise<BookEntityInterface> {
    const isUnique = await this.isNameUnique(data.name);
    if (!isUnique) {
      throw new BookNameAlreadyExistsException({ message: `${data.name} already exists` });
    }
    const createData = { ...data, status: data.status || BookStatus.ACTIVE };
    return super.create(createData);
  }

  async update(data: BookUpdatableInterface): Promise<BookEntityInterface> {
    const id = (data as any).id;
    const existing = await this.byId(id);
    if (!existing) {
      throw new BookNotFoundException({ message: `${id} not found` });
    }
    if (data.name && data.name !== (existing as any).name) {
      const isUnique = await this.isNameUnique(data.name, id);
      if (!isUnique) throw new BookNameAlreadyExistsException({ message: `${data.name} already exists` });
    }
    return super.update(data);
  }
}


