import { PlainLiteralObject } from '@nestjs/common';

import { ReferenceIdInterface } from '@bitwild/rockets-app';

export interface CreateOneInterface<
  T extends PlainLiteralObject,
  U extends ReferenceIdInterface,
> {
  create: (object: T) => Promise<U>;
}
