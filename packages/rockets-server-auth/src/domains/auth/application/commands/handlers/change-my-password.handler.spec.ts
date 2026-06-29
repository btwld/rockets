import { CommandBus } from '@nestjs/cqrs';
import { UnauthorizedException } from '@nestjs/common';
import {
  UpdateUserPasswordCommand,
  UserPasswordCurrentInvalidException,
} from '@concepta/nestjs-user';
import { AppContextHost } from '@concepta/nestjs-core';

import { ChangeMyPasswordCommand } from '../impl/change-my-password.command';
import { ChangeMyPasswordHandler } from './change-my-password.handler';
import { AbstractChangeMyPasswordHandler } from './abstract-change-my-password.handler';

describe(ChangeMyPasswordHandler.name, () => {
  let handler: ChangeMyPasswordHandler;
  let commandBus: jest.Mocked<Pick<CommandBus, 'execute'>>;

  beforeEach(() => {
    commandBus = { execute: jest.fn().mockResolvedValue(undefined) };
    handler = new ChangeMyPasswordHandler(commandBus as unknown as CommandBus);
  });

  function buildCommand() {
    return new ChangeMyPasswordCommand(
      new AppContextHost(),
      'user-123',
      'CurrentP@ssw0rd',
      'NewSecureP@ssw0rd',
    );
  }

  it('dispatches UpdateUserPasswordCommand with the swapped passwords', async () => {
    await handler.execute(buildCommand());

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(UpdateUserPasswordCommand),
    );
  });

  it('translates UserPasswordCurrentInvalidException to UnauthorizedException', async () => {
    commandBus.execute.mockRejectedValueOnce(
      new UserPasswordCurrentInvalidException(),
    );
    await expect(handler.execute(buildCommand())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rethrows unknown errors', async () => {
    commandBus.execute.mockRejectedValueOnce(new Error('db dead'));
    await expect(handler.execute(buildCommand())).rejects.toThrow('db dead');
  });

  describe('per-method override seams', () => {
    it('honors a subclass overriding only `afterChange`', async () => {
      const trail: string[] = [];

      class WithAudit extends AbstractChangeMyPasswordHandler {
        protected async afterChange(): Promise<void> {
          trail.push('audited');
        }
      }

      const sub = new WithAudit(commandBus as unknown as CommandBus);
      await sub.execute(buildCommand());

      expect(trail).toEqual(['audited']);
      expect(commandBus.execute).toHaveBeenCalledTimes(1);
    });

    it('honors a subclass overriding only `validate` to block weak passwords', async () => {
      class StrongOnly extends AbstractChangeMyPasswordHandler {
        protected async validate(_ctx: unknown, c: ChangeMyPasswordCommand) {
          if (c.newPassword.length < 32) {
            throw new UnauthorizedException('Password too short');
          }
          return { current: c.currentPassword, next: c.newPassword };
        }
      }

      const sub = new StrongOnly(commandBus as unknown as CommandBus);
      await expect(sub.execute(buildCommand())).rejects.toThrow(
        'Password too short',
      );
      expect(commandBus.execute).not.toHaveBeenCalled();
    });

    it('honors a subclass overriding only `persist` to mirror to a side-store', async () => {
      const mirror = jest.fn();

      class WithMirror extends AbstractChangeMyPasswordHandler {
        protected async persist(
          ctx: Parameters<AbstractChangeMyPasswordHandler['execute']>[0]['ctx'],
          userId: string,
          payload: { current: string; next: string },
        ): Promise<void> {
          await super['persist'](ctx, userId, payload);
          mirror(userId);
        }
      }

      const sub = new WithMirror(commandBus as unknown as CommandBus);
      await sub.execute(buildCommand());

      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      expect(mirror).toHaveBeenCalledWith('user-123');
    });
  });
});
