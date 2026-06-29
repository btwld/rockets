import { PlainLiteralObject } from '@nestjs/common';
import { Query } from '@nestjs/cqrs';
import { ReferenceSubject } from '@concepta/nestjs-core';
import {
  AuthenticationUserResult,
  GetUserBySubjectQueryInterface,
} from '@concepta/nestjs-authentication';

/**
 * Wire-compatible with the upstream
 * `@concepta/nestjs-authentication.GetUserBySubjectQueryInterface` so this
 * class can be plugged into `AuthenticationPortsInterface.user.getBySubjectQuery`.
 * Distinct from upstream's `@concepta/nestjs-user.GetUserBySubjectQuery` (same
 * name, different package) so routing flows through
 * {@link RocketsGetUserBySubjectHandler} — which augments the result with
 * `userRoles`.
 */
export class RocketsGetUserBySubjectQuery
  extends Query<AuthenticationUserResult>
  implements GetUserBySubjectQueryInterface
{
  readonly ctx: PlainLiteralObject;

  readonly subject: ReferenceSubject;

  constructor(ctx: PlainLiteralObject, subject: ReferenceSubject) {
    super();
    this.ctx = ctx;
    this.subject = subject;
  }
}
