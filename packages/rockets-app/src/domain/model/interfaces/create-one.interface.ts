import { PlainLiteralObject } from '@nestjs/common';

import { ReferenceIdInterface } from '../../reference/interfaces/reference-id.interface';

export interface CreateOneInterface<
  T extends PlainLiteralObject,
  U extends ReferenceIdInterface,
> {
  create: (object: T) => Promise<U>;
}
