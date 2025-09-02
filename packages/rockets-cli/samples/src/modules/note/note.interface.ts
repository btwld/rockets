import {
  AuditInterface,
  ByIdInterface,
  CreateOneInterface,
  FindInterface,
  ReferenceId,
  ReferenceIdInterface,
  RemoveOneInterface,
  UpdateOneInterface
} from '@concepta/nestjs-common';

export enum NoteStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export interface NoteInterface extends ReferenceIdInterface, AuditInterface {
  name: string;
  status: NoteStatus;
  title: string;
  content?: string;
}

export interface NoteEntityInterface extends NoteInterface {}

export interface NoteCreatableInterface extends Pick<NoteInterface, 'name' | 'title'>, Partial<Pick<NoteInterface, 'status' | 'content'>> {}

export interface NoteUpdatableInterface extends Pick<NoteInterface, 'id'>, Partial<Pick<NoteInterface, 'name' | 'status' | 'title&#x27; | &#x27;content'>> {}

export interface NoteModelServiceInterface
  extends FindInterface<NoteEntityInterface, NoteEntityInterface>,
    ByIdInterface<ReferenceId, NoteEntityInterface>,
    CreateOneInterface<NoteCreatableInterface, NoteEntityInterface>,
    UpdateOneInterface<NoteUpdatableInterface, NoteEntityInterface>,
    RemoveOneInterface<Pick<NoteEntityInterface, 'id'>, NoteEntityInterface>
{
  findByName(name: string): Promise<NoteEntityInterface | null>;
  isNameUnique(name: string, excludeId?: string): Promise<boolean>;
  getActiveNotes(): Promise<NoteEntityInterface[]>;
}


