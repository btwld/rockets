import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { AuthenticationOtpInterface } from '@concepta/nestjs-authentication';
import type { ReferenceId } from '@concepta/nestjs-common';
import {
  CreateOtpCommand,
  type Otp,
  type OtpCreatableInterface,
} from '@concepta/nestjs-otp';

import { RocketsAuthCreateOtpPortCommand } from './rockets-auth-create-otp-port.command';

/**
 * Delegates to upstream {@link CreateOtpCommand} using the `otp` payload as `dto`.
 */
@CommandHandler(RocketsAuthCreateOtpPortCommand)
export class RocketsAuthCreateOtpPortHandler
  implements
    ICommandHandler<
      RocketsAuthCreateOtpPortCommand,
      AuthenticationOtpInterface
    >
{
  constructor(private readonly commandBus: CommandBus) {}

  async execute(
    command: RocketsAuthCreateOtpPortCommand,
  ): Promise<AuthenticationOtpInterface> {
    const aggregate: Otp = await this.commandBus.execute(
      new CreateOtpCommand(
        command.ctx,
        command.namespace,
        command.otp as OtpCreatableInterface,
        {
          duplicateStrategy: command.duplicateStrategy,
          rateSeconds: command.rateSeconds,
          rateThreshold: command.rateThreshold,
        },
      ),
    );

    return {
      category: aggregate.category,
      type: aggregate.type,
      passcode: aggregate.passcode,
      expirationDate: aggregate.expirationDate,
      active: aggregate.active,
      assigneeId: aggregate.assigneeId as ReferenceId,
    };
  }
}
