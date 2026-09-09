import { describe, expect, it, vi } from 'vitest';

import { RocketsRecoveryService } from './rockets-recovery.service';

const ctx = { requestId: 'request-1' };
const policy = {
  otpCategory: 'recovery',
  otpNamespace: 'auth',
  otpType: 'uuid',
  otpExpiresIn: '1h',
  otpDuplicateStrategy: 'DEACTIVATE' as const,
  otpRateSeconds: 60,
  otpRateThreshold: 5,
};

function createSubject() {
  const otpPort = {
    create: vi.fn(),
    validate: vi.fn(),
    clear: vi.fn(),
  };
  const userPort = { getByEmail: vi.fn(), getById: vi.fn() };
  const passwordPort = { setPassword: vi.fn() };
  const commandBus = { execute: vi.fn() };
  // Outermost scope only — the operation runs with the same context.
  const txScope = {
    run: vi.fn(
      (ctx: unknown, operation: (txCtx: unknown) => Promise<unknown>) =>
        operation(ctx),
    ),
  };
  const notifications = {
    sendRecoverLoginNotificationCommand: class {},
    sendRecoverPasswordNotificationCommand: class {},
    sendPasswordUpdatedNotificationCommand: class {},
  };
  const subject = new RocketsRecoveryService(
    policy,
    otpPort as never,
    userPort as never,
    passwordPort as never,
    notifications as never,
    commandBus as never,
    txScope as never,
  );
  return { subject, otpPort, userPort, passwordPort, commandBus, txScope };
}

describe('RocketsRecoveryService', () => {
  it('awaits recovery notifications', async () => {
    const { subject, userPort, commandBus } = createSubject();
    userPort.getByEmail.mockResolvedValue({ id: 'u1', username: 'leo' });
    let release!: () => void;
    commandBus.execute.mockReturnValue(
      new Promise<void>((resolve) => (release = resolve)),
    );

    let settled = false;
    const pending = subject.recoverLogin(ctx, 'person@example.com').then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await pending;
    expect(commandBus.execute).toHaveBeenCalledOnce();
  });

  it('consumes the passcode before password mutate and best-effort notify', async () => {
    const { subject, otpPort, userPort, passwordPort, commandBus } =
      createSubject();
    commandBus.execute
      .mockResolvedValueOnce({ assigneeId: 'u1' })
      .mockRejectedValueOnce(new Error('mail provider included secret'));
    userPort.getById.mockResolvedValue({
      id: 'u1',
      email: 'person@example.com',
    });

    await expect(
      subject.updatePassword(ctx, 'otp-secret', 'password-secret'),
    ).resolves.toMatchObject({ id: 'u1' });
    expect(otpPort.validate).not.toHaveBeenCalled();
    expect(commandBus.execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        namespace: 'auth',
        otp: { category: 'recovery', passcode: 'otp-secret' },
      }),
    );
    expect(passwordPort.setPassword).toHaveBeenCalledWith(
      ctx,
      'password-secret',
      'u1',
    );
    expect(otpPort.clear).toHaveBeenCalledWith(ctx, 'auth', {
      category: 'recovery',
      assigneeId: 'u1',
    });
  });

  it('skips password mutate when consume returns null and never validates', async () => {
    const { subject, otpPort, userPort, passwordPort, commandBus } =
      createSubject();
    let remaining = 1;
    commandBus.execute.mockImplementation(
      async (cmd: { namespace?: string }) => {
        if (cmd.namespace === 'auth') {
          if (remaining === 0) return null;
          remaining -= 1;
          return { assigneeId: 'u1' };
        }
        return undefined;
      },
    );
    userPort.getById.mockResolvedValue({
      id: 'u1',
      email: 'person@example.com',
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        subject.updatePassword(ctx, 'shared-passcode', 'new-password'),
      ),
    );

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(results.filter((r) => r === null)).toHaveLength(19);
    expect(passwordPort.setPassword).toHaveBeenCalledTimes(1);
    expect(otpPort.validate).not.toHaveBeenCalled();
  });
});
