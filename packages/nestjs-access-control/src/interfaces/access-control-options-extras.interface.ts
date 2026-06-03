import { DynamicModule, Provider } from '@nestjs/common';

import { CanAccess } from './can-access.interface';

export interface AccessControlOptionsExtrasInterface
  extends Pick<DynamicModule, 'global' | 'imports'> {
  queryServices?: Provider<CanAccess>[];
}
