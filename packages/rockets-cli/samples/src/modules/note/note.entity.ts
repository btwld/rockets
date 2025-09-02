import { NoteEntityInterface, NoteStatus } from './note.interface';

export class NoteEntity implements NoteEntityInterface {
  title!: string;
  content?: string;
}


