import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeOrmExtModule } from '@concepta/nestjs-typeorm-ext';
import { NoteEntity } from './note.entity';
import { NoteModelService, NOTE_MODULE_NOTE_ENTITY_KEY } from './note-model.service';
import { NoteTypeOrmCrudAdapter } from './note-typeorm-crud.adapter';
import { NoteCrudService } from './note.crud.service';
import { NoteCrudController } from './note.crud.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NoteEntity]),
    TypeOrmExtModule.forFeature({ note: { entity: NoteEntity } }),
  ],
  providers: [
    NoteModelService,
    NoteTypeOrmCrudAdapter,
    NoteCrudService,
  ],
  controllers: [NoteCrudController],
  exports: [NoteModelService, NoteTypeOrmCrudAdapter, NoteCrudService],
})
export class NoteModule {}


