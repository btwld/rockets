import { ReferenceIdInterface } from '@bitwild/rockets-app';

export interface RemoveOneInterface<
  T extends ReferenceIdInterface,
  U extends ReferenceIdInterface = T,
> {
  remove: (object: T) => Promise<U>;
}
