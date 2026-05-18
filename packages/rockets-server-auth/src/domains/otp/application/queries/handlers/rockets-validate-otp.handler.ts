import {
  QueryHandler,
  IQueryHandler,
  QueryBus,
  CommandBus,
} from '@nestjs/cqrs';
import { AssigneeRelationInterface } from '@concepta/nestjs-common';
import { ValidateOtpQuery, ConsumeOtpCommand } from '@concepta/nestjs-otp';
import { RocketsValidateOtpQuery } from '../impl/rockets-validate-otp.query';

@QueryHandler(RocketsValidateOtpQuery)
export class RocketsValidateOtpHandler
  implements
    IQueryHandler<RocketsValidateOtpQuery, AssigneeRelationInterface | null>
{
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(
    query: RocketsValidateOtpQuery,
  ): Promise<AssigneeRelationInterface | null> {
    const namespace = String(query.assignment);
    const result = await this.queryBus.execute<
      ValidateOtpQuery,
      AssigneeRelationInterface | null
    >(
      new ValidateOtpQuery({}, namespace, {
        category: query.otp.category,
        passcode: query.otp.passcode,
      }),
    );
    if (result && query.deleteIfValid) {
      await this.commandBus.execute(
        new ConsumeOtpCommand({}, namespace, {
          category: query.otp.category,
          passcode: query.otp.passcode,
        }),
      );
    }
    return result;
  }
}
