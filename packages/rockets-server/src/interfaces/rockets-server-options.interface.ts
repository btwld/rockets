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
import { AuthRouterOptionsInterface } from '@concepta/nestjs-auth-router';
import { OtpOptionsInterface } from '@concepta/nestjs-otp';
import { PasswordOptionsInterface } from '@concepta/nestjs-password';
import { UserPasswordServiceInterface } from '@concepta/nestjs-user';
import { UserOptionsInterface } from '@concepta/nestjs-user/dist/interfaces/user-options.interface';
import { UserPasswordHistoryServiceInterface } from '@concepta/nestjs-user/dist/interfaces/user-password-history-service.interface';
import { RocketsServerNotificationServiceInterface } from './rockets-server-notification.service.interface';
import { RocketsServerSettingsInterface } from './rockets-server-settings.interface';
import { RocketsServerUserModelServiceInterface } from './rockets-server-user-model-service.interface';
import { SwaggerUiOptionsInterface } from '@concepta/nestjs-swagger-ui/dist/interfaces/swagger-ui-options.interface';
import { CrudModuleOptionsInterface } from '@concepta/nestjs-crud/dist/interfaces/crud-module-options.interface';
import { RoleOptionsInterface } from '@concepta/nestjs-role/dist/interfaces/role-options.interface';

/**
 * Combined options interface for the AuthenticationCombinedModule
 */
export interface RocketsServerOptionsInterface {
  /**
   * Global settings for the Rockets Server module
   * Used to configure default behaviors and settings
   */
  settings?: RocketsServerSettingsInterface;

  /**
   * Swagger UI configuration options
   * Used to customize the Swagger/OpenAPI documentation interface
   */
  swagger?: SwaggerUiOptionsInterface;
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
   * Auth Guard Router module options
   * Used in: AuthGuardRouterModule.forRootAsync
   * Configures the Auth Guard Router with provider-specific guards
   */
  authRouter?: AuthRouterOptionsInterface;

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
  // TODO: add partial
  authVerify?: AuthVerifyOptionsInterface;

  /**
   * User module options
   * Used in: UserModule.forRootAsync
   */
  user?: UserOptionsInterface;

  password?: PasswordOptionsInterface;

  otp?: OtpOptionsInterface;

  email?: Partial<EmailOptionsInterface>;

  crud?: CrudModuleOptionsInterface;

  role?: Partial<RoleOptionsInterface>;

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
