import { PipeTransform, PlainLiteralObject, Type } from '@nestjs/common';

import { CrudValidationOptions } from '../../../../crud.types';

export interface CrudBodyOptionsInterface<
  T extends PlainLiteralObject = PlainLiteralObject,
> {
  validation?: CrudValidationOptions<T>;
  pipes?: (Type<PipeTransform> | PipeTransform)[];
}
