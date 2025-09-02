import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeOrmCrudAdapter } from '@concepta/nestjs-crud';
import { NoteEntity } from './note.entity';

@Injectable()
export class NoteTypeOrmCrudAdapter extends TypeOrmCrudAdapter<NoteEntity> {
  constructor(
    @InjectRepository(NoteEntity)
    private readonly repo: Repository<NoteEntity>,
  ) {
    super(repo);
  }
}


