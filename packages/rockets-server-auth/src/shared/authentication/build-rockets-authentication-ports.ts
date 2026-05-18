import { InternalServerErrorException, Type } from '@nestjs/common';
import type { AuthenticationPortsInterface } from '@concepta/nestjs-authentication';
import { ClearOtpsCommand, ValidateOtpQuery } from '@concepta/nestjs-otp';
import {
  GetUserByEmailQuery,
  GetUserQuery,
  UpdateUserCommand,
} from '@concepta/nestjs-user';

import { RocketsAuthUserPortGetByUsernameQuery } from '../../domains/user/application/queries/impl/rockets-auth-user-port-get-by-username.query';
import { RocketsGetUserBySubjectQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-subject.query';
import type { RocketsAuthOptionsInterface } from '../interfaces/rockets-auth-options.interface';
import { RocketsAuthCreateOtpPortCommand } from './rockets-auth-create-otp-port.command';
import {
  RocketsAuthSetPasswordPortCommand,
  RocketsAuthValidatePasswordPortCommand,
} from './rockets-auth-password-port.commands';

/**
 * Fail-fast helper: rockets-auth no longer ships silent no-op notification
 * commands. Consumers MUST supply real Command classes for every
 * `authentication.ports.{recoveryNotification,verifyNotification}` field,
 * each with a `@CommandHandler` registered on the CQRS bus, so recovery /
 * password-update / verify emails actually go out.
 */
function requirePortClass<T>(
  value: Type<T> | undefined,
  configPath: string,
): Type<T> {
  if (!value) {
    throw new InternalServerErrorException(
      `RocketsAuthModule: \`authentication.ports.${configPath}\` is not ` +
        `configured. Provide a CQRS Command class (with a registered ` +
        `@CommandHandler) that actually sends the corresponding email — ` +
        `previous releases silently defaulted to a no-op, hiding broken ` +
        `recovery/verify flows.`,
    );
  }
  return value;
}

/**
 * Builds a fully typed {@link AuthenticationPortsInterface} for
 * {@link AuthenticationModule}, bridging Concepta CQRS commands where constructor
 * shapes differ from the authentication port contracts.
 */
export function buildRocketsAuthenticationPorts(
  options: RocketsAuthOptionsInterface,
): AuthenticationPortsInterface {
  const incoming = options.authentication?.ports;

  return {
    user: {
      // Rockets defaults — local queries (`getBySubjectQuery`,
      // `getByUsernameQuery`) augment the upstream result with `userRoles`;
      // overriding them defeats role-based auth unless the consumer's query
      // does the same augmentation.
      getByIdQuery: GetUserQuery,
      getBySubjectQuery: RocketsGetUserBySubjectQuery,
      getByUsernameQuery: RocketsAuthUserPortGetByUsernameQuery,
      getByEmailQuery: GetUserByEmailQuery,
      updateCommand: UpdateUserCommand,
      ...incoming?.user,
    },
    password: {
      validateCommand: RocketsAuthValidatePasswordPortCommand,
      setPasswordCommand: RocketsAuthSetPasswordPortCommand,
      ...incoming?.password,
    },
    otp: {
      createCommand: RocketsAuthCreateOtpPortCommand,
      validateQuery: ValidateOtpQuery,
      clearCommand: ClearOtpsCommand,
      ...incoming?.otp,
    },
    recoveryNotification: {
      sendRecoverLoginNotificationCommand: requirePortClass(
        incoming?.recoveryNotification?.sendRecoverLoginNotificationCommand,
        'recoveryNotification.sendRecoverLoginNotificationCommand',
      ),
      sendRecoverPasswordNotificationCommand: requirePortClass(
        incoming?.recoveryNotification?.sendRecoverPasswordNotificationCommand,
        'recoveryNotification.sendRecoverPasswordNotificationCommand',
      ),
      sendPasswordUpdatedNotificationCommand: requirePortClass(
        incoming?.recoveryNotification?.sendPasswordUpdatedNotificationCommand,
        'recoveryNotification.sendPasswordUpdatedNotificationCommand',
      ),
    },
    verifyNotification: {
      sendVerifyNotificationCommand: requirePortClass(
        incoming?.verifyNotification?.sendVerifyNotificationCommand,
        'verifyNotification.sendVerifyNotificationCommand',
      ),
    },
    // Optional ports — upstream wires its own defaults
    // (`SignAccessTokenCommand`, `IssueAccessTokenCommand`, etc.). We only
    // include them in the returned object if the consumer supplied an
    // override, so the upstream defaults stay in effect by default.
    // Consumers can replace these to plug in KMS-backed signers, custom
    // claim transforms, key rotation, or alternate verification strategies.
    ...(incoming?.jwt ? { jwt: incoming.jwt } : {}),
    ...(incoming?.token ? { token: incoming.token } : {}),
  };
}
