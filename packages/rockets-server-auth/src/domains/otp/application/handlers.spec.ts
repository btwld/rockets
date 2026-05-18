import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ValidateOtpQuery,
  ConsumeOtpCommand,
  CreateOtpCommand,
  ClearOtpsCommand,
} from '@concepta/nestjs-otp';

import { RocketsValidateOtpHandler } from './queries/handlers/rockets-validate-otp.handler';
import { RocketsValidateOtpQuery } from './queries/impl/rockets-validate-otp.query';
import { RocketsCreateOtpHandler } from './commands/handlers/rockets-create-otp.handler';
import { RocketsCreateOtpCommand } from './commands/impl/rockets-create-otp.command';
import { RocketsClearOtpsHandler } from './commands/handlers/rockets-clear-otps.handler';
import { RocketsClearOtpsCommand } from './commands/impl/rockets-clear-otps.command';

describe('OTP application handlers', () => {
  let queryBus: { execute: jest.Mock };
  let commandBus: { execute: jest.Mock };

  beforeEach(() => {
    queryBus = { execute: jest.fn() };
    commandBus = { execute: jest.fn() };
  });

  describe('RocketsValidateOtpHandler', () => {
    let handler: RocketsValidateOtpHandler;

    beforeEach(() => {
      handler = new RocketsValidateOtpHandler(
        queryBus as unknown as QueryBus,
        commandBus as unknown as CommandBus,
      );
    });

    it('returns null when upstream returns null and skips consume', async () => {
      queryBus.execute.mockResolvedValueOnce(null);
      const out = await handler.execute(
        new RocketsValidateOtpQuery(
          'user-otp',
          { category: 'recovery', passcode: 'abc' },
          true,
        ),
      );
      expect(out).toBeNull();
      expect(queryBus.execute).toHaveBeenCalledWith(
        expect.any(ValidateOtpQuery),
      );
      expect(commandBus.execute).not.toHaveBeenCalled();
    });

    it('returns assignee and consumes when valid + deleteIfValid', async () => {
      const assignee = { assigneeId: 'u1' };
      queryBus.execute.mockResolvedValueOnce(assignee);
      const out = await handler.execute(
        new RocketsValidateOtpQuery(
          'user-otp',
          { category: 'recovery', passcode: 'abc' },
          true,
        ),
      );
      expect(out).toBe(assignee);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.any(ConsumeOtpCommand),
      );
    });

    it('skips consume when deleteIfValid=false even on success', async () => {
      const assignee = { assigneeId: 'u1' };
      queryBus.execute.mockResolvedValueOnce(assignee);
      const out = await handler.execute(
        new RocketsValidateOtpQuery(
          'user-otp',
          { category: 'recovery', passcode: 'abc' },
          false,
        ),
      );
      expect(out).toBe(assignee);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('RocketsCreateOtpHandler', () => {
    it('dispatches CreateOtpCommand with assignment as namespace', async () => {
      const handler = new RocketsCreateOtpHandler(
        commandBus as unknown as CommandBus,
      );
      const created = { id: 'otp1' };
      commandBus.execute.mockResolvedValueOnce(created);

      const out = await handler.execute(
        new RocketsCreateOtpCommand({
          assignment: 'user-otp',
          otp: {
            category: 'recovery',
            type: 'uuid',
            assigneeId: 'u1',
            expiresIn: '1h',
          },
        }),
      );

      expect(out).toBe(created);
      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.any(CreateOtpCommand),
      );
    });
  });

  describe('RocketsClearOtpsHandler', () => {
    it('dispatches ClearOtpsCommand with assignment as namespace', async () => {
      const handler = new RocketsClearOtpsHandler(
        commandBus as unknown as CommandBus,
      );
      commandBus.execute.mockResolvedValueOnce(undefined);

      await handler.execute(
        new RocketsClearOtpsCommand('user-otp', {
          category: 'recovery',
          assigneeId: 'u1',
        }),
      );

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.any(ClearOtpsCommand),
      );
    });
  });
});
