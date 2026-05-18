import { Global, Module, Provider, Type } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { PasswordPort, UserPort } from '@concepta/nestjs-authentication';
import {
  AUTHENTICATION_PASSWORD_PORT_TOKEN,
  AUTHENTICATION_USER_PORT_TOKEN,
} from '@concepta/nestjs-authentication/dist/authentication.constants';

import { buildRocketsAuthenticationPorts } from '../authentication/build-rockets-authentication-ports';
import { RAW_OPTIONS_TOKEN } from '../constants/rockets-auth-raw-options.token';
import type { RocketsAuthOptionsInterface } from '../interfaces/rockets-auth-options.interface';
import {
  RocketsAuthOtpPortService,
  ROCKETS_AUTH_OTP_PORT_TOKEN,
} from './rockets-auth-otp-port.service';
import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
} from './rockets-auth-user-port.service';
import { RocketsAuthPortsConfigInterface } from '../interfaces/rockets-auth-ports-config.interface';

import { RocketsGetUserByEmailHandler } from '../../domains/user/application/queries/handlers/rockets-get-user-by-email.handler';
import { RocketsGetUserByUsernameHandler } from '../../domains/user/application/queries/handlers/rockets-get-user-by-username.handler';
import { RocketsGetUserBySubjectHandler } from '../../domains/user/application/queries/handlers/rockets-get-user-by-subject.handler';
import { RocketsGetUserByIdHandler } from '../../domains/user/application/queries/handlers/rockets-get-user-by-id.handler';
import { RocketsCreateUserHandler } from '../../domains/user/application/commands/handlers/rockets-create-user.handler';
import { RocketsUpdateUserHandler } from '../../domains/user/application/commands/handlers/rockets-update-user.handler';
import { GetActiveCredentialHandler } from '../../domains/user/application/queries/handlers/get-active-credential.handler';
import { RocketsAuthUserPortGetByUsernameHandler } from '../../domains/user/application/queries/handlers/rockets-auth-user-port-get-by-username.handler';
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
    ];

    const handlerProviders: Provider[] = [
      ...resolvedUserHandlers,
      RocketsAuthUserPortGetByUsernameHandler,
      ...resolvedOtpHandlers,
    ];

    const authenticationUpstreamPortProviders: Provider[] = [
      {
        provide: AUTHENTICATION_USER_PORT_TOKEN,
        inject: [QueryBus, CommandBus, RAW_OPTIONS_TOKEN],
        useFactory: (
          queryBus: QueryBus,
          commandBus: CommandBus,
          opts: RocketsAuthOptionsInterface,
        ): UserPort =>
          new UserPort(
            buildRocketsAuthenticationPorts(opts).user,
            queryBus,
            commandBus,
          ),
      },
      {
        provide: AUTHENTICATION_PASSWORD_PORT_TOKEN,
        inject: [CommandBus, RAW_OPTIONS_TOKEN],
        useFactory: (
          commandBus: CommandBus,
          opts: RocketsAuthOptionsInterface,
        ): PasswordPort =>
          new PasswordPort(
            buildRocketsAuthenticationPorts(opts).password,
            commandBus,
          ),
      },
    ];

    const allProviders = [
      ...serviceProviders,
      ...authenticationUpstreamPortProviders,
      ...handlerProviders,
    ];

    return {
      module: RocketsAuthPortsModule,
      global: true,
      providers: allProviders,
      exports: allProviders,
    };
  }
}
