import { AuthRecoveryNotificationServiceInterface } from '@concepta/nestjs-auth-recovery/dist/interfaces/auth-recovery-notification.service.interface';
import { AuthVerifyNotificationServiceInterface } from '@concepta/nestjs-auth-verify/dist/interfaces/auth-verify-notification.service.interface';

export interface RocketsServerAuthNotificationServiceInterface
  extends AuthRecoveryNotificationServiceInterface,
    AuthVerifyNotificationServiceInterface {}
