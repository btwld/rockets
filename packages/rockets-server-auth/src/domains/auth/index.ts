// Auth Domain Public API
//
// v8 `AuthenticationModule` registers strategies and CQRS token handlers.
// Rockets adds HTTP routes: `RocketsAuthTokenController` (`/token/password`,
// `/token/refresh`), and the factory-built `MePasswordController` (`/me/password`).

// Gateway controllers
export { buildMePasswordController } from './gateways/http/factories/build-me-password-controller';
export { RocketsAuthTokenController } from './gateways/http/controllers/rockets-auth-token.controller';

// Application — Commands
export { ChangeMyPasswordCommand } from './application/commands/impl/change-my-password.command';
export {
  AbstractChangeMyPasswordHandler,
  type ChangeMyPasswordPayload,
} from './application/commands/handlers/abstract-change-my-password.handler';
export { ChangeMyPasswordHandler } from './application/commands/handlers/change-my-password.handler';

// Infrastructure — DTOs
export { RocketsAuthChangePasswordDto } from './infrastructure/dto/rockets-auth-change-password.dto';

// Public interfaces (controller extras)
export type {
  MePasswordControllerExtras,
  MePasswordRouteExtras,
  RocketsAuthClassDecorator,
  RocketsAuthMethodDecorator,
  RocketsAuthRouteHandlerOverride,
} from './interfaces/me-password-controller-extras.interface';
