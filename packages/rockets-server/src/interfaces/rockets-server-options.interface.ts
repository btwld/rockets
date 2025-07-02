import { AuthJwtOptionsInterface } from '@concepta/nestjs-auth-jwt/dist/interfaces/auth-jwt-options.interface';
import { AuthRefreshOptions } from '@concepta/nestjs-auth-refresh/dist/auth-refresh.module-definition';

import { ValidateTokenServiceInterface } from '@concepta/nestjs-authentication/dist/interfaces/validate-token-service.interface';

import { CanAccess } from '@concepta/nestjs-access-control';
import { AuthLocalValidateUserServiceInterface } from '@concepta/nestjs-auth-local';
import { AuthLocalOptionsInterface } from '@concepta/nestjs-auth-local/dist/interfaces/auth-local-options.interface';
import { AuthRecoveryOptionsInterface } from '@concepta/nestjs-auth-recovery/dist/interfaces/auth-recovery-options.interface';
import { AuthVerifyOptionsInterface } from '@concepta/nestjs-auth-verify/dist/interfaces/auth-verify-options.interface';
import {
  AuthenticationOptionsInterface,
  IssueTokenServiceInterface,
  VerifyTokenService,
} from '@concepta/nestjs-authentication';
import {
  EmailOptionsInterface,
  EmailServiceInterface,
} from '@concepta/nestjs-email';
import { JwtOptions } from '@concepta/nestjs-jwt/dist/jwt.module-definition';
import { OtpOptionsInterface } from '@concepta/nestjs-otp';
import { PasswordOptionsInterface } from '@concepta/nestjs-password';
import { UserPasswordServiceInterface } from '@concepta/nestjs-user';
import { UserOptionsInterface } from '@concepta/nestjs-user/dist/interfaces/user-options.interface';
import { UserPasswordHistoryServiceInterface } from '@concepta/nestjs-user/dist/interfaces/user-password-history-service.interface';
import { RocketsServerNotificationServiceInterface } from './rockets-server-notification.service.interface';
import { RocketsServerSettingsInterface } from './rockets-server-settings.interface';
import { RocketsServerUserModelServiceInterface } from './rockets-server-user-model-service.interface';
import { SwaggerUiOptionsInterface } from '@concepta/nestjs-swagger-ui/dist/interfaces/swagger-ui-options.interface';

/**
 * Combined options interface for the AuthenticationCombinedModule
 */
export interface RocketsServerOptionsInterface {
  settings?: RocketsServerSettingsInterface;
  
  swagger?: SwaggerUiOptionsInterface;
  /**
   * Core Authentication module options
   * Used in: AuthenticationModule.forRootAsync
   */
  authentication?: AuthenticationOptionsInterface;

  /**
   * JWT module options
   * Used in: JwtModule.forRootAsync
   */
  jwt?: JwtOptions;

  /**
   * Auth JWT module options
   * Used in: AuthJwtModule.forRootAsync
   */
  authJwt?: AuthJwtOptionsInterface;

  /**
   * Auth Local module options
   * Used in: AuthLocalModule.forRootAsync
   */
  authLocal?: AuthLocalOptionsInterface;

  /**
   * Auth Recovery module options
   * Used in: AuthRecoveryModule.forRootAsync
   */
  authRecovery?: AuthRecoveryOptionsInterface;

  /**
   * Auth Refresh module options
   * Used in: AuthRefreshModule.forRootAsync
   */
  refresh?: AuthRefreshOptions;

  /**
   * Auth Verify module options
   * Used in: AuthVerifyModule.forRootAsync
   */
  authVerify?: AuthVerifyOptionsInterface;

  /**
   * User module options
   * Used in: UserModule.forRootAsync
   */
  user?: UserOptionsInterface;

  password?: PasswordOptionsInterface;

  otp?: OtpOptionsInterface;

  email?: Partial<EmailOptionsInterface>;

  /**
   * Core services used across different modules
   */
  services: {
    /**
     * Core user lookup service used across multiple modules
     * Used in: AuthJwtModule, AuthRefreshModule, AuthLocalModule, AuthRecoveryModule
     * Required: true
     */
    userModelService?: RocketsServerUserModelServiceInterface;

    /**
     * Notification service for sending recovery notifications
     * Can be used to customize notification delivery
     * Used in: AuthRecoveryModule
     * Required: false
     */
    notificationService?: RocketsServerNotificationServiceInterface;
    /**
     * Core authentication services used in AuthenticationModule
     * Required: true
     */
    verifyTokenService?: VerifyTokenService;
    issueTokenService?: IssueTokenServiceInterface;
    validateTokenService?: ValidateTokenServiceInterface;
    validateUserService?: AuthLocalValidateUserServiceInterface;
    /**
     * User module services
     * Used in: UserModule
     * Required: false
     */
    userPasswordService?: UserPasswordServiceInterface;
    userPasswordHistoryService?: UserPasswordHistoryServiceInterface;
    userAccessQueryService?: CanAccess;
    /**
     * Email service for notifications
     * Used in: AuthRecoveryModule
     * Required: true
     */
    // TODO: combine both? should we have a default mailer?
    mailerService: EmailServiceInterface;
  };
}
