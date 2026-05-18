import { PlainLiteralObject } from '@nestjs/common';
import { Command, Query } from '@nestjs/cqrs';

import { ClearOtpsCommand, ValidateOtpQuery } from '@concepta/nestjs-otp';
import {
  GetUserByEmailQuery,
  GetUserQuery,
  UpdateUserCommand,
} from '@concepta/nestjs-user';
import type {
  AuthenticationUserResult,
  AuthorizationPayloadInterface,
  Token,
} from '@concepta/nestjs-authentication';
import type { ReferenceEmail } from '@concepta/nestjs-common';

import { RocketsAuthUserPortGetByUsernameQuery } from '../../domains/user/application/queries/impl/rockets-auth-user-port-get-by-username.query';
import { RocketsGetUserBySubjectQuery } from '../../domains/user/application/queries/impl/rockets-get-user-by-subject.query';
import { RocketsAuthCreateOtpPortCommand } from './rockets-auth-create-otp-port.command';
import {
  RocketsAuthSetPasswordPortCommand,
  RocketsAuthValidatePasswordPortCommand,
} from './rockets-auth-password-port.commands';

import { buildRocketsAuthenticationPorts } from './build-rockets-authentication-ports';
import type { RocketsAuthOptionsInterface } from '../interfaces/rockets-auth-options.interface';

// Recovery / verify notification fakes — each one must structurally
// satisfy the upstream port command interface, otherwise the typed
// `Type<XCommandInterface>` slot in `RocketsAuthOptionsInterface.authentication.ports`
// refuses the assignment.
class FakeRecoverLoginCommand extends Command<void> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly email: ReferenceEmail,
    public readonly username: string,
  ) {
    super();
  }
}
class FakeRecoverPasswordCommand extends Command<void> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly email: ReferenceEmail,
    public readonly passcode: string,
    public readonly tokenExp: Date,
  ) {
    super();
  }
}
class FakePasswordUpdatedCommand extends Command<void> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly email: ReferenceEmail,
  ) {
    super();
  }
}
class FakeVerifyCommand extends Command<void> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly email: ReferenceEmail,
    public readonly passcode: string,
    public readonly tokenExp: Date,
  ) {
    super();
  }
}

class FakeSignAccessCommand extends Command<string> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly token: Token,
  ) {
    super();
  }
}
class FakeSignRefreshCommand extends Command<string> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly token: Token,
  ) {
    super();
  }
}
class FakeJwtVerifyAccessQuery extends Query<PlainLiteralObject> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly token: string,
  ) {
    super();
  }
}
class FakeJwtVerifyRefreshQuery extends Query<PlainLiteralObject> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly token: string,
  ) {
    super();
  }
}
class FakeIssueAccessCommand extends Command<string> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly payload: AuthorizationPayloadInterface,
  ) {
    super();
  }
}
class FakeIssueRefreshCommand extends Command<string> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly payload: AuthorizationPayloadInterface,
  ) {
    super();
  }
}
class FakeTokenVerifyAccessQuery extends Query<PlainLiteralObject> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly token: string,
  ) {
    super();
  }
}
class FakeTokenVerifyRefreshQuery extends Query<PlainLiteralObject> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly token: string,
  ) {
    super();
  }
}
class FakeValidateTokenQuery extends Query<boolean> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly payload: PlainLiteralObject,
  ) {
    super();
  }
}

// User port query that matches `GetUserByEmailQueryInterface`.
class CustomGetByEmailQuery extends Query<AuthenticationUserResult> {
  constructor(
    public readonly ctx: PlainLiteralObject,
    public readonly email: ReferenceEmail,
  ) {
    super();
  }
}

function baseOptionsWithRequiredNotifications(): RocketsAuthOptionsInterface {
  return {
    settings: {} as RocketsAuthOptionsInterface['settings'],
    services: {
      mailerService: { sendMail: jest.fn() },
    },
    authentication: {
      ports: {
        recoveryNotification: {
          sendRecoverLoginNotificationCommand: FakeRecoverLoginCommand,
          sendRecoverPasswordNotificationCommand: FakeRecoverPasswordCommand,
          sendPasswordUpdatedNotificationCommand: FakePasswordUpdatedCommand,
        },
        verifyNotification: {
          sendVerifyNotificationCommand: FakeVerifyCommand,
        },
      },
    },
  };
}

describe(buildRocketsAuthenticationPorts.name, () => {
  describe('defaults (consumer supplies only required notifications)', () => {
    it('returns rockets-default user / password / otp / notification ports', () => {
      const ports = buildRocketsAuthenticationPorts(
        baseOptionsWithRequiredNotifications(),
      );

      expect(ports.user).toEqual({
        getByIdQuery: GetUserQuery,
        getBySubjectQuery: RocketsGetUserBySubjectQuery,
        getByUsernameQuery: RocketsAuthUserPortGetByUsernameQuery,
        getByEmailQuery: GetUserByEmailQuery,
        updateCommand: UpdateUserCommand,
      });
      expect(ports.password).toEqual({
        validateCommand: RocketsAuthValidatePasswordPortCommand,
        setPasswordCommand: RocketsAuthSetPasswordPortCommand,
      });
      expect(ports.otp).toEqual({
        createCommand: RocketsAuthCreateOtpPortCommand,
        validateQuery: ValidateOtpQuery,
        clearCommand: ClearOtpsCommand,
      });
      expect(
        ports.recoveryNotification.sendRecoverLoginNotificationCommand,
      ).toBe(FakeRecoverLoginCommand);
      expect(ports.verifyNotification.sendVerifyNotificationCommand).toBe(
        FakeVerifyCommand,
      );
    });

    it('omits optional jwt and token keys when consumer does not provide them', () => {
      const ports = buildRocketsAuthenticationPorts(
        baseOptionsWithRequiredNotifications(),
      );

      // Keys must be ABSENT, not just undefined — upstream uses
      // `in` checks to decide whether to fall back to its own defaults.
      expect('jwt' in ports).toBe(false);
      expect('token' in ports).toBe(false);
    });
  });

  describe('consumer overrides flow through', () => {
    it('forwards individual user port overrides while keeping defaults for the rest', () => {
      const options = baseOptionsWithRequiredNotifications();
      // The upstream type declares `user: UserPortSettings` (all 5 keys
      // required), but the runtime spread in `buildRocketsAuthenticationPorts`
      // performs a shallow merge — so consumers can in practice override
      // a single field. Match the strict type at call time, then verify the
      // shallow-merge semantics from the function's perspective.
      options.authentication = {
        ...options.authentication,
        ports: {
          ...options.authentication!.ports!,
          user: {
            getByIdQuery: GetUserQuery,
            getBySubjectQuery: RocketsGetUserBySubjectQuery,
            getByUsernameQuery: RocketsAuthUserPortGetByUsernameQuery,
            getByEmailQuery: CustomGetByEmailQuery,
            updateCommand: UpdateUserCommand,
          },
        },
      };

      const ports = buildRocketsAuthenticationPorts(options);

      expect(ports.user.getByEmailQuery).toBe(CustomGetByEmailQuery);
      // Other keys came through (rockets defaults + consumer-supplied
      // identicals are indistinguishable at runtime — what matters is
      // the spread didn't drop them).
      expect(ports.user.getByIdQuery).toBe(GetUserQuery);
    });

    it('includes ports.jwt only when consumer supplies it', () => {
      const options = baseOptionsWithRequiredNotifications();
      options.authentication = {
        ...options.authentication,
        ports: {
          ...options.authentication!.ports!,
          jwt: {
            signAccessTokenCommand: FakeSignAccessCommand,
            signRefreshTokenCommand: FakeSignRefreshCommand,
            verifyAccessTokenQuery: FakeJwtVerifyAccessQuery,
            verifyRefreshTokenQuery: FakeJwtVerifyRefreshQuery,
          },
        },
      };

      const ports = buildRocketsAuthenticationPorts(options);

      expect(ports.jwt).toEqual({
        signAccessTokenCommand: FakeSignAccessCommand,
        signRefreshTokenCommand: FakeSignRefreshCommand,
        verifyAccessTokenQuery: FakeJwtVerifyAccessQuery,
        verifyRefreshTokenQuery: FakeJwtVerifyRefreshQuery,
      });
      expect('token' in ports).toBe(false);
    });

    it('includes ports.token only when consumer supplies it', () => {
      const options = baseOptionsWithRequiredNotifications();
      options.authentication = {
        ...options.authentication,
        ports: {
          ...options.authentication!.ports!,
          token: {
            issueAccessTokenCommand: FakeIssueAccessCommand,
            issueRefreshTokenCommand: FakeIssueRefreshCommand,
            verifyAccessTokenQuery: FakeTokenVerifyAccessQuery,
            verifyRefreshTokenQuery: FakeTokenVerifyRefreshQuery,
            validateTokenQuery: FakeValidateTokenQuery,
          },
        },
      };

      const ports = buildRocketsAuthenticationPorts(options);

      expect(ports.token).toEqual({
        issueAccessTokenCommand: FakeIssueAccessCommand,
        issueRefreshTokenCommand: FakeIssueRefreshCommand,
        verifyAccessTokenQuery: FakeTokenVerifyAccessQuery,
        verifyRefreshTokenQuery: FakeTokenVerifyRefreshQuery,
        validateTokenQuery: FakeValidateTokenQuery,
      });
      expect('jwt' in ports).toBe(false);
    });
  });

  describe('fail-fast on missing required notification commands', () => {
    it('throws when sendRecoverLoginNotificationCommand is missing', () => {
      const options = baseOptionsWithRequiredNotifications();
      delete options.authentication!.ports!.recoveryNotification!
        .sendRecoverLoginNotificationCommand;

      expect(() => buildRocketsAuthenticationPorts(options)).toThrow(
        /recoveryNotification\.sendRecoverLoginNotificationCommand/,
      );
    });

    it('throws when sendVerifyNotificationCommand is missing', () => {
      const options = baseOptionsWithRequiredNotifications();
      delete options.authentication!.ports!.verifyNotification!
        .sendVerifyNotificationCommand;

      expect(() => buildRocketsAuthenticationPorts(options)).toThrow(
        /verifyNotification\.sendVerifyNotificationCommand/,
      );
    });
  });
});
