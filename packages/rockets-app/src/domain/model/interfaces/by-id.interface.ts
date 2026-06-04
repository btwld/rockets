import { ReferenceIdInterface } from '../../reference/interfaces/reference-id.interface';
import { ReferenceId } from '../../reference/interfaces/reference.types';

export interface ByIdInterface<T = ReferenceId, U = ReferenceIdInterface> {
  byId: (id: T) => Promise<U | null>;
}
