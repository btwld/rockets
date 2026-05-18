import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { RocketsAuthOtpPortService } from './rockets-auth-otp-port.service';
import { RocketsCreateOtpCommand } from '../../domains/otp/application/commands/impl/rockets-create-otp.command';
import { RocketsClearOtpsCommand } from '../../domains/otp/application/commands/impl/rockets-clear-otps.command';
import { RocketsValidateOtpQuery } from '../../domains/otp/application/queries/impl/rockets-validate-otp.query';

describe('RocketsAuthOtpPortService', () => {
  let service: RocketsAuthOtpPortService;
  let commandBus: { execute: jest.Mock };
  let queryBus: { execute: jest.Mock };

  beforeEach(() => {
    commandBus = { execute: jest.fn() };
    queryBus = { execute: jest.fn() };
    service = new RocketsAuthOtpPortService(
      commandBus as unknown as CommandBus,
      queryBus as unknown as QueryBus,
    );
  });

  it('create dispatches RocketsCreateOtpCommand', async () => {
    const created = { id: 'otp1' };
    commandBus.execute.mockResolvedValueOnce(created);
    const out = await service.create({
      assignment: 'user-otp',
      otp: {
        category: 'recovery',
        type: 'uuid',
        assigneeId: 'u1',
        expiresIn: '1h',
      },
    });
    expect(out).toBe(created);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(RocketsCreateOtpCommand),
    );
  });

  it('validate dispatches RocketsValidateOtpQuery', async () => {
    const assignee = { assigneeId: 'u1' };
    queryBus.execute.mockResolvedValueOnce(assignee);
    const out = await service.validate(
      'user-otp',
      { category: 'recovery', passcode: '123' },
      false,
    );
    expect(out).toBe(assignee);
    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(RocketsValidateOtpQuery),
    );
  });

  it('clear dispatches RocketsClearOtpsCommand', async () => {
    commandBus.execute.mockResolvedValueOnce(undefined);
    await service.clear('user-otp', {
      category: 'recovery',
      assigneeId: 'u1',
    });
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(RocketsClearOtpsCommand),
    );
  });
});
