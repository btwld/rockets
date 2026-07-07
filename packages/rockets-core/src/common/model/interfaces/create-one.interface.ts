import { PlainLiteralObject } from '@nestjs/common';

import { ReferenceIdInterface } from '@concepta/nestjs-core';

export interface CreateOneInterface<
  T extends PlainLiteralObject,
  U extends ReferenceIdInterface,
> {
  create: (object: T) => Promise<U>;
}
