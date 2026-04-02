import {
  QueryHandler,
  IQueryHandler,
  QueryBus,
  CommandBus,
} from '@nestjs/cqrs';
import { AssigneeRelationInterface } from '@concepta/nestjs-common';
import { ValidateOtpQuery, ConsumeOtpCommand } from '@concepta/nestjs-otp';
import { createRepositoryContext } from '../../../../../shared/utils/repository-context.helper';
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
    const ctx = createRepositoryContext(String(query.assignment));
    const result = await this.queryBus.execute<
      ValidateOtpQuery,
      AssigneeRelationInterface | null
    >(
      new ValidateOtpQuery(ctx, {
        category: query.otp.category,
        passcode: query.otp.passcode,
      }),
    );
    if (result && query.deleteIfValid) {
      await this.commandBus.execute(
        new ConsumeOtpCommand(ctx, {
          category: query.otp.category,
          passcode: query.otp.passcode,
        }),
      );
    }
    return result;
  }
}
