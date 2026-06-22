import { ReferenceIdInterface } from '@bitwild/rockets-app';

export interface UpdateOneInterface<
  T extends ReferenceIdInterface,
  U extends ReferenceIdInterface = T,
> {
  update: (object: T) => Promise<U>;
}
