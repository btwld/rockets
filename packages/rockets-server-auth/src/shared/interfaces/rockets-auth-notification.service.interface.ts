import { AuthRecoveryNotificationServiceInterface } from '@concepta/nestjs-auth-recovery';
import { AuthVerifyNotificationServiceInterface } from '../compat/concepta-internals';

export interface RocketsAuthNotificationServiceInterface
  extends AuthRecoveryNotificationServiceInterface,
    AuthVerifyNotificationServiceInterface {}
