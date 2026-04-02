import { Global, Module, Provider, Type } from '@nestjs/common';
import {
  RocketsAuthOtpPortService,
  ROCKETS_AUTH_OTP_PORT_TOKEN,
} from './rockets-auth-otp-port.service';
import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
  ROCKETS_AUTH_USER_PASSWORD_PORT_TOKEN,
} from './rockets-auth-user-port.service';
import { RocketsAuthPortsConfigInterface } from '../interfaces/rockets-auth-ports-config.interface';

import { RocketsGetUserByEmailHandler } from '../../domains/user/application/queries/handlers/rockets-get-user-by-email.handler';
import { RocketsGetUserByUsernameHandler } from '../../domains/user/application/queries/handlers/rockets-get-user-by-username.handler';
import { RocketsGetUserBySubjectHandler } from '../../domains/user/application/queries/handlers/rockets-get-user-by-subject.handler';
import { RocketsGetUserByIdHandler } from '../../domains/user/application/queries/handlers/rockets-get-user-by-id.handler';
import { RocketsCreateUserHandler } from '../../domains/user/application/commands/handlers/rockets-create-user.handler';
import { RocketsUpdateUserHandler } from '../../domains/user/application/commands/handlers/rockets-update-user.handler';
import { GetActiveCredentialHandler } from '../../domains/user/application/queries/handlers/get-active-credential.handler';
import { RocketsCreateOtpHandler } from '../../domains/otp/application/commands/handlers/rockets-create-otp.handler';
import { RocketsClearOtpsHandler } from '../../domains/otp/application/commands/handlers/rockets-clear-otps.handler';
import { RocketsValidateOtpHandler } from '../../domains/otp/application/queries/handlers/rockets-validate-otp.handler';

const DEFAULT_USER_HANDLERS = {
  getUserByEmail: RocketsGetUserByEmailHandler,
  getUserByUsername: RocketsGetUserByUsernameHandler,
  getUserBySubject: RocketsGetUserBySubjectHandler,
  getUserById: RocketsGetUserByIdHandler,
  createUser: RocketsCreateUserHandler,
  updateUser: RocketsUpdateUserHandler,
  getActiveCredential: GetActiveCredentialHandler,
} as const;

const DEFAULT_OTP_HANDLERS = {
  createOtp: RocketsCreateOtpHandler,
  validateOtp: RocketsValidateOtpHandler,
  clearOtps: RocketsClearOtpsHandler,
} as const;

function resolveHandlers<K extends string>(
  defaults: Record<K, Type<unknown>>,
  overrides: Partial<Record<K, Type<unknown>>>,
): Type<unknown>[] {
  return (Object.keys(defaults) as K[]).map(
    (key) => overrides[key] ?? defaults[key],
  );
}

@Global()
@Module({})
export class RocketsAuthPortsModule {
  static forRoot(config?: RocketsAuthPortsConfigInterface): {
    module: typeof RocketsAuthPortsModule;
    global: boolean;
    providers: Provider[];
    exports: Provider[];
  } {
    const resolvedUserHandlers = resolveHandlers(
      DEFAULT_USER_HANDLERS,
      config?.user?.handlers ?? {},
    );

    const resolvedOtpHandlers = resolveHandlers(
      DEFAULT_OTP_HANDLERS,
      config?.otp?.handlers ?? {},
    );

    const serviceProviders: Provider[] = [
      RocketsAuthOtpPortService,
      {
        provide: ROCKETS_AUTH_OTP_PORT_TOKEN,
        useExisting: RocketsAuthOtpPortService,
      },
      RocketsAuthUserPortService,
      {
        provide: ROCKETS_AUTH_USER_PORT_TOKEN,
        useExisting: RocketsAuthUserPortService,
      },
      {
        provide: ROCKETS_AUTH_USER_PASSWORD_PORT_TOKEN,
        useValue: {},
      },
    ];

    const handlerProviders: Provider[] = [
      ...resolvedUserHandlers,
      ...resolvedOtpHandlers,
    ];

    const allProviders = [...serviceProviders, ...handlerProviders];

    return {
      module: RocketsAuthPortsModule,
      global: true,
      providers: allProviders,
      exports: allProviders,
    };
  }
}
