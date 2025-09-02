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

export enum BookStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export interface BookInterface extends ReferenceIdInterface, AuditInterface {
  name: string;
  status: BookStatus;
  title: string;
  subtitle?: string;
  category: string;
}

export interface BookEntityInterface extends BookInterface {}

export interface BookCreatableInterface extends Pick<BookInterface, 'name' | 'title&#x27; | &#x27;category'>, Partial<Pick<BookInterface, 'status' | 'subtitle'>> {}

export interface BookUpdatableInterface extends Pick<BookInterface, 'id'>, Partial<Pick<BookInterface, 'name' | 'status' | 'title&#x27; | &#x27;subtitle&#x27; | &#x27;category'>> {}

export interface BookModelServiceInterface
  extends FindInterface<BookEntityInterface, BookEntityInterface>,
    ByIdInterface<ReferenceId, BookEntityInterface>,
    CreateOneInterface<BookCreatableInterface, BookEntityInterface>,
    UpdateOneInterface<BookUpdatableInterface, BookEntityInterface>,
    RemoveOneInterface<Pick<BookEntityInterface, 'id'>, BookEntityInterface>
{
  findByName(name: string): Promise<BookEntityInterface | null>;
  isNameUnique(name: string, excludeId?: string): Promise<boolean>;
  getActiveBooks(): Promise<BookEntityInterface[]>;
}


