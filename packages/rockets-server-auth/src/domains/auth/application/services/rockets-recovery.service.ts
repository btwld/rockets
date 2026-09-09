import { Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  OtpPort,
  PasswordPort,
  RecoveryPolicy,
  type RecoveryNotificationPortSettings,
  type RecoveryService,
  UserPort,
} from '@concepta/nestjs-authentication';
import type {
  AppContextLike,
  AssigneeRelationInterface,
  ReferenceIdInterface,
} from '@concepta/nestjs-core';
import { ConsumeOtpCommand } from '@concepta/nestjs-otp';
import { TransactionScope } from '@concepta/nestjs-repository';

/**
 * This class is registered under the upstream `RecoveryService` DI token, so it
 * must stay substitutable for its public surface — otherwise an upstream caller
 * hits `TypeError: not a function` at runtime. `Pick<…, keyof …>` projects only
 * the public members; a plain `implements RecoveryService` cannot work because
 * upstream declares its ports `private`.
 */
type RecoveryServiceContract = Pick<RecoveryService, keyof RecoveryService>;

/** Rockets-owned recovery implementation that never launches detached commands. */
export class RocketsRecoveryService implements RecoveryServiceContract {
  private readonly logger = new Logger(RocketsRecoveryService.name);

  constructor(
    private readonly policy: RecoveryPolicy,
    private readonly otpPort: OtpPort,
    private readonly userPort: UserPort,
    private readonly passwordPort: PasswordPort,
    private readonly notifications: RecoveryNotificationPortSettings,
    private readonly commandBus: CommandBus,
    private readonly txScope: TransactionScope,
  ) {}

  async recoverLogin(ctx: AppContextLike, email: string): Promise<void> {
    const appCtx = ctx ?? {};
    const user = await this.userPort.getByEmail(appCtx, email);
    if (!user) return;
    const Command = this.notifications.sendRecoverLoginNotificationCommand;
    await this.commandBus.execute(new Command(appCtx, email, user.username));
  }

  async recoverPassword(ctx: AppContextLike, email: string): Promise<void> {
    const appCtx = ctx ?? {};
    const user = await this.userPort.getByEmail(appCtx, email);
    if (!user) return;
    const otp = await this.otpPort.create(
      appCtx,
      this.policy.otpNamespace,
      {
        category: this.policy.otpCategory,
        type: this.policy.otpType,
        expiresIn: this.policy.otpExpiresIn,
        assigneeId: user.id,
        rateSeconds: this.policy.otpRateSeconds,
        rateThreshold: this.policy.otpRateThreshold,
      },
      {
        duplicateStrategy: this.policy.otpDuplicateStrategy,
        rateSeconds: this.policy.otpRateSeconds,
        rateThreshold: this.policy.otpRateThreshold,
      },
    );
    const Command = this.notifications.sendRecoverPasswordNotificationCommand;
    await this.commandBus.execute(
      new Command(appCtx, email, otp.passcode, otp.expirationDate),
    );
  }

  validatePasscode(
    ctx: AppContextLike,
    passcode: string,
  ): Promise<AssigneeRelationInterface | null> {
    return this.otpPort.validate(ctx ?? {}, this.policy.otpNamespace, {
      category: this.policy.otpCategory,
      passcode,
    });
  }

  private consumePasscode(
    ctx: NonNullable<AppContextLike>,
    passcode: string,
  ): Promise<AssigneeRelationInterface | null> {
    return this.commandBus.execute(
      new ConsumeOtpCommand(ctx, this.policy.otpNamespace, {
        category: this.policy.otpCategory,
        passcode,
      }),
    );
  }

  async updatePassword(
    ctx: AppContextLike,
    passcode: string,
    newPassword: string,
  ): Promise<ReferenceIdInterface | null> {
    const appCtx = ctx ?? {};
    // One transaction for the whole rotation. Consume is still the single
    // application decision point (no validate-then-mutate): it runs first,
    // inside the scope, so a failed password write rolls the consume back
    // with it and nothing half-happens. The outermost scope must be THIS
    // one: the consume handler opens its own scope, and once an outermost
    // scope commits, the request context keeps the finished transaction —
    // every later repository call on that context would find it closed.
    // DB-level single-winner under concurrent consumes still needs
    // upstream nestjs-otp locking.
    const user = await this.txScope.run(appCtx, async (txCtx) => {
      const otp = await this.consumePasscode(txCtx, passcode);
      if (!otp) return null;
      const found = await this.userPort.getById(txCtx, otp.assigneeId);
      if (!found) return null;

      await this.passwordPort.setPassword(txCtx, newPassword, found.id);
      // Clear any other active recovery OTPs for this user (defense in
      // depth when duplicateStrategy ALLOW left siblings).
      await this.otpPort.clear(txCtx, this.policy.otpNamespace, {
        category: this.policy.otpCategory,
        assigneeId: found.id,
      });
      return found;
    });
    if (!user) return null;

    const Command = this.notifications.sendPasswordUpdatedNotificationCommand;
    try {
      await this.commandBus.execute(new Command(appCtx, user.email));
    } catch (error: unknown) {
      this.logger.error('Password-updated recovery notification failed', {
        userId: user.id,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return user;
  }

  async revokeAllUserPasswordRecoveries(
    ctx: AppContextLike,
    email: string,
  ): Promise<void> {
    const appCtx = ctx ?? {};
    const user = await this.userPort.getByEmail(appCtx, email);
    if (!user) return;
    await this.otpPort.clear(appCtx, this.policy.otpNamespace, {
      category: this.policy.otpCategory,
      assigneeId: user.id,
    });
  }
}
