import { AuthJwtOptionsInterface } from '@concepta/nestjs-auth-jwt';
import { AuthRefreshOptionsInterface } from '@concepta/nestjs-auth-refresh';

import { ValidateTokenServiceInterface } from '@concepta/nestjs-authentication';

import { CanAccess } from '@concepta/nestjs-access-control';
// TODO: update on core modules
import { AuthAppleOptionsInterface } from '@concepta/nestjs-auth-apple/dist/interfaces/auth-apple-options.interface';
import { AuthGithubOptionsInterface } from '@concepta/nestjs-auth-github/dist/interfaces/auth-github-options.interface';
import { AuthGoogleOptionsInterface } from '@concepta/nestjs-auth-google/dist/interfaces/auth-google-options.interface';
import {
  AuthLocalOptionsInterface,
  AuthLocalValidateUserServiceInterface,
} from '@concepta/nestjs-auth-local';
import { AuthRecoveryOptionsInterface } from '@concepta/nestjs-auth-recovery';
import { AuthVerifyOptionsInterface } from '@concepta/nestjs-auth-verify';
import {
  AuthenticationOptionsInterface,
  IssueTokenServiceInterface,
  VerifyTokenService,
} from '@concepta/nestjs-authentication';
import {
  EmailOptionsInterface,
  EmailServiceInterface,
} from '@concepta/nestjs-email';
import { FederatedOptionsInterface } from '@concepta/nestjs-federated/dist/interfaces/federated-options.interface';
import { JwtOptionsInterface } from '@concepta/nestjs-jwt';
import {
  OAuthOptionsExtrasInterface,
  OAuthOptionsInterface,
} from '@concepta/nestjs-oauth';
import { OtpOptionsInterface } from '@concepta/nestjs-otp';
import { PasswordOptionsInterface } from '@concepta/nestjs-password';
import { UserPasswordServiceInterface } from '@concepta/nestjs-user';
import { UserOptionsInterface } from '@concepta/nestjs-user/dist/interfaces/user-options.interface';
import { UserPasswordHistoryServiceInterface } from '@concepta/nestjs-user/dist/interfaces/user-password-history-service.interface';
import { RocketsServerNotificationServiceInterface } from './rockets-server-notification.service.interface';
import { RocketsServerSettingsInterface } from './rockets-server-settings.interface';
import { RocketsServerUserModelServiceInterface } from './rockets-server-user-model-service.interface';

/**
 * Combined options interface for the AuthenticationCombinedModule
 */
export interface RocketsServerOptionsInterface {
  settings?: RocketsServerSettingsInterface;
  /**
   * Core Authentication module options
   * Used in: AuthenticationModule.forRootAsync
   */
  authentication?: AuthenticationOptionsInterface;

  /**
   * Federated authentication module options
   * Used in: FederatedModule.forRootAsync
   */
  federated?: Partial<FederatedOptionsInterface>;

  /**
   * JWT module options
   * Used in: JwtModule.forRootAsync
   */
  jwt?: JwtOptionsInterface;

  /**
   * Auth JWT module options
   * Used in: AuthJwtModule.forRootAsync
   */
  authJwt?: AuthJwtOptionsInterface;

  /**
   * OAuth module options
   * Used in: OAuthModule.forRootAsync
   * Configures the OAuth guard router with provider-specific guards
   */
  oauth?: OAuthOptionsInterface & OAuthOptionsExtrasInterface;

  /**
   * Auth Apple module options
   * Used in: AuthAppleModule.forRootAsync
   */
  authApple?: AuthAppleOptionsInterface;

  /**
   * Auth GitHub module options
   * Used in: AuthGithubModule.forRootAsync
   */
  authGithub?: AuthGithubOptionsInterface;

  /**
   * Auth Google module options
   * Used in: AuthGoogleModule.forRootAsync
   */
  authGoogle?: AuthGoogleOptionsInterface;

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
  refresh?: AuthRefreshOptionsInterface;

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
    // TODO: need to update AuthRefreshOptionsInterface to use verifyTokenServiceInterface
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
