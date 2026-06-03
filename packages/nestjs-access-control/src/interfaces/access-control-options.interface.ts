import { CanActivate, NestInterceptor } from '@nestjs/common';

import { AccessControlServiceInterface } from './access-control-service.interface';
import { AccessControlSettingsInterface } from './access-control-settings.interface';

export interface AccessControlOptionsInterface {
  settings: AccessControlSettingsInterface;
  service?: AccessControlServiceInterface;
  appGuard?: CanActivate | false;
  appFilter?: NestInterceptor | false;
}
