// OTP Domain Public API
//
// Phase 3 (2026-04-29): controller is factory-built with extras
// (decorators per route). Service is split into per-method seams
// (resolveUser / issueOtp / deliver / validatePasscode) — override one
// step instead of subclassing the whole service.

// Gateway controller factory
export { buildRocketsAuthOtpController } from './gateways/http/factories/build-rockets-auth-otp-controller';

// DTOs
export { RocketsAuthOtpConfirmDto } from './infrastructure/dto/rockets-auth-otp-confirm.dto';
export { RocketsAuthOtpSendDto } from './infrastructure/dto/rockets-auth-otp-send.dto';

// Domain exceptions
export { RocketsAuthOtpException } from './domain/exceptions/rockets-auth-otp.exception';

// Services (override-friendly via protected seam methods)
export { RocketsAuthOtpService } from './infrastructure/services/rockets-auth-otp.service';
export { RocketsAuthNotificationService } from './infrastructure/services/rockets-auth-notification.service';

// Application — Commands
export { RocketsCreateOtpCommand } from './application/commands/impl/rockets-create-otp.command';
export { RocketsClearOtpsCommand } from './application/commands/impl/rockets-clear-otps.command';
export { RocketsValidateOtpQuery } from './application/queries/impl/rockets-validate-otp.query';

// Application — Handlers
export { RocketsCreateOtpHandler } from './application/commands/handlers/rockets-create-otp.handler';
export { RocketsClearOtpsHandler } from './application/commands/handlers/rockets-clear-otps.handler';
export { RocketsValidateOtpHandler } from './application/queries/handlers/rockets-validate-otp.handler';

// Interfaces
export { RocketsAuthOtpServiceInterface } from './interfaces/rockets-auth-otp-service.interface';
export { RocketsAuthOtpNotificationServiceInterface } from './interfaces/rockets-auth-otp-notification-service.interface';
export { RocketsAuthOtpSettingsInterface } from './interfaces/rockets-auth-otp-settings.interface';
export { RocketsAuthUserOtpSettingsInterface } from './interfaces/rockets-auth-user-otp-settings.interface';
export type {
  OtpControllerExtras,
  OtpRouteExtras,
  OtpRoutesMap,
} from './interfaces/otp-controller-extras.interface';
