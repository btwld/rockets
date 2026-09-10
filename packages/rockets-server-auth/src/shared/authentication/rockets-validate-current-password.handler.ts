import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  PasswordCreationService,
  type PasswordStorageInterface,
} from '@concepta/nestjs-password';

/** A distinct CQRS route avoids competing with the upstream command handler. */
export class RocketsValidateCurrentPasswordCommand extends Command<boolean> {
  constructor(
    readonly password: string,
    readonly target: PasswordStorageInterface,
  ) {
    super();
  }
}

/**
 * Normalize credential aggregates before delegating. Upstream currently
 * spreads the target, which drops prototype getters and nested `props`; remove
 * this adapter when it preserves aggregate `passwordHash` values.
 */
function toPasswordStorageInterface(
  target: unknown,
): PasswordStorageInterface | undefined {
  if (!target || typeof target !== 'object') {
    return undefined;
  }
  const o = target as Record<string, unknown> & {
    toPlain?: () => Record<string, unknown>;
  };
  if (typeof o.passwordHash === 'string') {
    return { passwordHash: o.passwordHash };
  }
  if (typeof o.toPlain === 'function') {
    const plain = o.toPlain();
    if (plain && typeof plain.passwordHash === 'string') {
      return { passwordHash: plain.passwordHash };
    }
  }
  const props = o.props as { passwordHash?: string } | undefined;
  if (props && typeof props.passwordHash === 'string') {
    return { passwordHash: props.passwordHash };
  }
  return undefined;
}

/** Validate a current password after normalizing the credential shape. */
@Injectable()
@CommandHandler(RocketsValidateCurrentPasswordCommand)
export class RocketsValidateCurrentPasswordHandler
  implements ICommandHandler<RocketsValidateCurrentPasswordCommand, boolean>
{
  constructor(
    private readonly passwordCreationService: PasswordCreationService,
  ) {}

  async execute(
    command: RocketsValidateCurrentPasswordCommand,
  ): Promise<boolean> {
    const normalized = toPasswordStorageInterface(command.target);
    if (!normalized) {
      throw new InternalServerErrorException(
        'RocketsValidateCurrentPasswordCommand received a target without a ' +
          'reachable passwordHash (POJO, aggregate.toPlain(), or .props). ' +
          'Check the upstream caller that built the command.',
      );
    }
    return this.passwordCreationService.validateCurrent({
      password: command.password,
      target: normalized,
    });
  }
}
