import { PlainLiteralObject } from '@nestjs/common';
import { Query } from '@nestjs/cqrs';
import {
  AuthenticationUserResult,
  GetUserByUsernameQueryInterface,
} from '@concepta/nestjs-authentication';

/**
 * Query shape used by {@link UserPort#getByUsername} from `@concepta/nestjs-authentication`.
 * Distinct from upstream nestjs-user `GetUserByUsernameQuery` so routing goes through Rockets
 * dynamic-repository handlers ({@link RocketsGetUserByUsernameHandler}) instead of the
 * default nestjs-user repository adapter.
 */
export class RocketsAuthUserPortGetByUsernameQuery
  extends Query<AuthenticationUserResult>
  implements GetUserByUsernameQueryInterface
{
  readonly ctx: PlainLiteralObject;

  readonly username: string;

  constructor(ctx: PlainLiteralObject, username: string) {
    super();
    this.ctx = ctx;
    this.username = username;
  }
}
