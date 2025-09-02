import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { BookEntity } from './book.entity';

@Injectable()
export class BookTypeOrmCrudAdapter extends TypeOrmCrudAdapter<BookEntity> {
  constructor(
    @InjectRepository(BookEntity)
    private readonly repo: Repository<BookEntity>,
  ) {
    super(repo);
  }
}


