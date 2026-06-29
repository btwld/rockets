import { ReferenceIdInterface } from '@concepta/nestjs-core';

export interface UpdateOneInterface<
  T extends ReferenceIdInterface,
  U extends ReferenceIdInterface = T,
> {
  update: (object: T) => Promise<U>;
}
