import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { BookEntity } from './book.entity';
import { BookModelService, BOOK_MODULE_BOOK_ENTITY_KEY } from './book-model.service';
import { BookTypeOrmCrudAdapter } from './book-typeorm-crud.adapter';
import { BookCrudService } from './book.crud.service';
import { BookCrudController } from './book.crud.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BookEntity]),
    TypeOrmExtModule.forFeature({ book: { entity: BookEntity } }),
  ],
  providers: [
    BookModelService,
    BookTypeOrmCrudAdapter,
    BookCrudService,
  ],
  controllers: [BookCrudController],
  exports: [BookModelService, BookTypeOrmCrudAdapter, BookCrudService],
})
export class BookModule {}


