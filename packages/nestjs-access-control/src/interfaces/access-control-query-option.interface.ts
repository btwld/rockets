import { Type } from '@nestjs/common';

import { CanAccess } from './can-access.interface';

export interface AccessControlQueryOptionInterface {
  /**
   * Service used for advanced validation
   */
  service: Type<CanAccess>;
}
