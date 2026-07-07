import { ReferenceIdInterface } from '@concepta/nestjs-core';

export interface RemoveOneInterface<
  T extends ReferenceIdInterface,
  U extends ReferenceIdInterface = T,
> {
  remove: (object: T) => Promise<U>;
}
