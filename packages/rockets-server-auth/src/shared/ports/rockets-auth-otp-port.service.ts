import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  OtpCreateInterface,
  OtpValidateInterface,
  OtpClearInterface,
  OtpInterface,
  AssigneeRelationInterface,
  ReferenceAssignment,
  OtpCreateParamsInterface,
} from '@concepta/nestjs-common';
import { RocketsCreateOtpCommand } from '../../domains/otp/application/commands/impl/rockets-create-otp.command';
import { RocketsClearOtpsCommand } from '../../domains/otp/application/commands/impl/rockets-clear-otps.command';
import { RocketsValidateOtpQuery } from '../../domains/otp/application/queries/impl/rockets-validate-otp.query';

export const ROCKETS_AUTH_OTP_PORT_TOKEN = Symbol('__ROCKETS_AUTH_OTP_PORT__');

@Injectable()
export class RocketsAuthOtpPortService
  implements OtpCreateInterface, OtpValidateInterface, OtpClearInterface
{
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async create(params: OtpCreateParamsInterface): Promise<OtpInterface> {
    return this.commandBus.execute(new RocketsCreateOtpCommand(params));
  }

  async validate(
    assignment: ReferenceAssignment,
    otp: Pick<OtpInterface, 'category' | 'passcode'>,
    deleteIfValid: boolean,
  ): Promise<AssigneeRelationInterface | null> {
    return this.queryBus.execute(
      new RocketsValidateOtpQuery(assignment, otp, deleteIfValid),
    );
  }

  async clear(
    assignment: ReferenceAssignment,
    otp: Pick<OtpInterface, 'assigneeId' | 'category'>,
  ): Promise<void> {
    await this.commandBus.execute(new RocketsClearOtpsCommand(assignment, otp));
  }
}
