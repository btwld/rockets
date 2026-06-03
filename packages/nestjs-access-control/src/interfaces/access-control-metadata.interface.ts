import { Type } from '@nestjs/common';

import { AccessControlServiceInterface } from './access-control-service.interface';

export interface AccessControlMetadataInterface {
  service?: Type<AccessControlServiceInterface>;
}
