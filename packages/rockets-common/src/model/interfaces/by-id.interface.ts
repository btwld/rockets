import { ReferenceIdInterface } from '@concepta/nestjs-core';
import { ReferenceId } from '@concepta/nestjs-core';

export interface ByIdInterface<T = ReferenceId, U = ReferenceIdInterface> {
  byId: (id: T) => Promise<U | null>;
}
