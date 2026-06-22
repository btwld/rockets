import { ReferenceIdInterface } from '@bitwild/rockets-app';
import { ReferenceId } from '@bitwild/rockets-app';

export interface ByIdInterface<T = ReferenceId, U = ReferenceIdInterface> {
  byId: (id: T) => Promise<U | null>;
}
