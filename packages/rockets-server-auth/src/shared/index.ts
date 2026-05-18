export * from './constants/repository-entity-keys.constants';
export * from './constants/rockets-auth.constants';

export { rocketsAuthOptionsDefaultConfig } from './config/rockets-auth-options-default.config';

export { RocketsAuthException } from './exceptions/rockets-auth.exception';

export {
  logAndGetErrorDetails,
  getErrorDetails,
  ErrorDetails,
} from './utils/error-logging.helper';

export { RocketsAuthOptionsInterface } from './interfaces/rockets-auth-options.interface';
export {
  RocketsAuthOptionsExtrasInterface,
  UserMetadataConfigInterface,
} from './interfaces/rockets-auth-options-extras.interface';
export type {
  RocketsAuthRepositoryPersistenceEntities,
  RocketsAuthRepositoryPersistenceOptions,
} from './interfaces/rockets-auth-repository-persistence.interface';
export { RocketsAuthSettingsInterface } from './interfaces/rockets-auth-settings.interface';

export {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
} from './ports/rockets-auth-user-port.service';
export {
  RocketsAuthOtpPortService,
  ROCKETS_AUTH_OTP_PORT_TOKEN,
} from './ports/rockets-auth-otp-port.service';
export { RocketsAuthPortsModule } from './ports/rockets-auth-ports.module';

export type {
  RocketsAuthPortsConfigInterface,
  RocketsAuthUserPortHandlersInterface,
  RocketsAuthOtpPortHandlersInterface,
} from './interfaces/rockets-auth-ports-config.interface';
