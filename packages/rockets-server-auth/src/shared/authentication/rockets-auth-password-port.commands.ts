import { PlainLiteralObject } from '@nestjs/common';
import { Command } from '@nestjs/cqrs';
import { ReferenceId, ReferenceIdInterface } from '@concepta/nestjs-common';
import type {
  SetPasswordCommandInterface,
  ValidatePasswordCommandInterface,
} from '@concepta/nestjs-authentication';

/**
 * CQRS command shape required by {@link PasswordPort} (`validate(ctx, password, target)`).
 * Bridges to upstream {@link ValidateCurrentPasswordCommand} via
 * {@link RocketsAuthValidatePasswordPortHandler}.
 */
export class RocketsAuthValidatePasswordPortCommand
  extends Command<boolean>
  implements ValidatePasswordCommandInterface
{
  readonly ctx: PlainLiteralObject;

  readonly password: string;

  readonly target: ReferenceIdInterface;

  constructor(
    ctx: PlainLiteralObject,
    password: string,
    target: ReferenceIdInterface,
  ) {
    super();
    this.ctx = ctx;
    this.password = password;
    this.target = target;
  }
}

/**
 * CQRS command shape required by {@link PasswordPort} (`setPassword(ctx, password, assigneeId)`).
 * Bridges to {@link UpdateUserPasswordCommand} via {@link RocketsAuthSetPasswordPortHandler}.
 */
export class RocketsAuthSetPasswordPortCommand
  extends Command<void>
  implements SetPasswordCommandInterface
{
  readonly ctx: PlainLiteralObject;

  readonly password: string;

  readonly assigneeId: ReferenceId;

  constructor(
    ctx: PlainLiteralObject,
    password: string,
    assigneeId: ReferenceId,
  ) {
    super();
    this.ctx = ctx;
    this.password = password;
    this.assigneeId = assigneeId;
  }
}
