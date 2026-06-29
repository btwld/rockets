import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  AssigneeRelationInterface,
  ReferenceAssignment,
} from '@concepta/nestjs-core';
import { OtpInterface } from '@concepta/nestjs-otp';

import { RocketsCreateOtpCommand } from '../../domains/otp/application/commands/impl/rockets-create-otp.command';
import type { RocketsCreateOtpParams } from '../../domains/otp/application/commands/impl/rockets-create-otp.command';
import { RocketsClearOtpsCommand } from '../../domains/otp/application/commands/impl/rockets-clear-otps.command';
import { RocketsValidateOtpQuery } from '../../domains/otp/application/queries/impl/rockets-validate-otp.query';

export const ROCKETS_AUTH_OTP_PORT_TOKEN = Symbol('__ROCKETS_AUTH_OTP_PORT__');

/**
 * OTP port adapter — bridges Rockets-internal callers (the OTP controller,
 * recovery / verify command handlers) to the v8 nestjs-otp CQRS surface
 * via Rockets-local query/command classes.
 *
 * v8 collapse: in v7 this implemented `OtpCreateInterface`,
 * `OtpValidateInterface`, `OtpClearInterface` from `@concepta/nestjs-common`
 * (the upstream service-shape contracts). v8 removed those interfaces — the
 * `OtpPort` exposed by `@concepta/nestjs-authentication` v8 is a class, not
 * an interface to implement, and is configured at module-registration time
 * via CQRS Command/Query class types (not service instances). This adapter
 * therefore exposes a Rockets-shaped surface only, preserved for internal
 * callers that already depend on it.
 */
@Injectable()
export class RocketsAuthOtpPortService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async create(params: RocketsCreateOtpParams): Promise<OtpInterface> {
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
