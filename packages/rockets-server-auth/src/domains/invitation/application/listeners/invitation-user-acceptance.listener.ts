import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { PlainLiteralObject } from '@nestjs/common';
import { CommandBus, EventsHandler, IEventHandler } from '@nestjs/cqrs';

import { AssignRoleCommand } from '@concepta/nestjs-role';
import { InvitationAcceptedEvent } from '@concepta/nestjs-invitation';

import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
} from '../../../../shared/ports/rockets-auth-user-port.service';
import { RocketsAuthSetPasswordPortCommand } from '../../../../shared/authentication/rockets-auth-password-port.commands';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  RocketsAuthSettingsInterface,
  USER_ROLE_ENTITY_KEY,
} from '../../../../shared';
import { AssignDefaultRoleCommand } from '../../../user/application/commands/impl/assign-default-role.command';
import { SaveUserMetadataCommand } from '../../../user/application/commands/impl/save-user-metadata.command';
import { RocketsAuthUserMetadataUpdatableInterface } from '../../../user/interfaces/rockets-auth-user-metadata-updatable.interface';
import { InvitationAcceptanceDataInterface } from '../../interfaces/invitation-acceptance-data.interface';
import {
  InvitationAcceptanceConfig,
  INVITATION_ACCEPTANCE_CONFIG_TOKEN,
} from '../../infrastructure/config/invitation-acceptance.config';
import {
  AppContextHost,
  validateWithSchema,
  TransactionScope,
} from '@concepta/rockets-core';

/**
 * A validated metadata patch is an object by construction (the schema
 * parsed it); anything else means the configured update schema does not
 * describe an object, which is a configuration error, not user input.
 */
function toMetadataPatch(
  value: unknown,
): RocketsAuthUserMetadataUpdatableInterface {
  if (typeof value !== 'object' || value === null) {
    throw new BadRequestException('userMetadata must be an object');
  }
  return value;
}

/**
 * Invitation User Acceptance Listener
 * Handles CQRS {@link InvitationAcceptedEvent} from `@concepta/nestjs-invitation` v8:
 * - Hashes password if provided
 * - Creates or updates user metadata (always validated with the update
 *   schema — the app's, or the base default that strips every key)
 * - Assigns role (from invitation.constraints.roleId set at creation, or default role)
 *
 * SECURITY:
 * - Role assignment is admin-controlled via invitation.constraints.roleId
 * - Only userMetadata is updatable by user (validated with the update schema;
 *   there is no unvalidated path, so a smuggled `userId` never reaches the row)
 * - User fields (active, email, username) are blocked from user updates
 */
@Injectable()
@EventsHandler(InvitationAcceptedEvent)
export class InvitationUserAcceptanceListener
  implements IEventHandler<InvitationAcceptedEvent>
{
  public readonly logger = new Logger(InvitationUserAcceptanceListener.name);

  constructor(
    @Inject(ROCKETS_AUTH_USER_PORT_TOKEN)
    public readonly userModelService: RocketsAuthUserPortService,
    public readonly commandBus: CommandBus,
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    public readonly settings: RocketsAuthSettingsInterface,
    @Inject(INVITATION_ACCEPTANCE_CONFIG_TOKEN)
    public readonly config: InvitationAcceptanceConfig,
    private readonly txScope: TransactionScope,
  ) {}

  async handle(event: InvitationAcceptedEvent): Promise<void> {
    const invitation = event.invitation;
    const acceptanceData = event.payload as
      | InvitationAcceptanceDataInterface
      | undefined;

    if (invitation.category !== 'user') {
      return;
    }

    // Wrap the full acceptance flow in a single repository transaction so
    // failures after `updateUserActivation` roll back the activation rather
    // than leaving the user half-onboarded (active=true, no metadata, no
    // role). The outer catch keeps the event-listener contract (don't
    // re-throw — other listeners on the same event still get to run).
    const ctx = new AppContextHost();
    try {
      await this.txScope.run(ctx, async (txCtx) => {
        const { password, userMetadata } =
          this.extractAcceptedData(acceptanceData);

        const userExists = await this.ensureUserExists({
          ctx: txCtx,
          userId: invitation.userId,
          invitationId: invitation.id,
        });
        if (!userExists) return;

        await this.updateUserActivation(txCtx, invitation.userId);
        await this.setPassword(txCtx, invitation.userId, password);

        await this.updateUserMetadata({
          ctx: txCtx,
          userId: invitation.userId,
          userMetadata,
        });

        const allowedRoleId = invitation.constraints?.roleId as
          | string
          | undefined;
        await this.assignUserRole(txCtx, invitation.userId, allowedRoleId);
        this.logAcceptanceSuccess({
          invitationId: invitation.id,
          userId: invitation.userId,
          category: invitation.category,
          roleId: allowedRoleId,
        });
      });
    } catch (error) {
      this.logger.error('Failed to process invitation acceptance', {
        invitationId: invitation.id,
        userId: invitation.userId,
        category: invitation.category,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private extractAcceptedData(data: InvitationAcceptanceDataInterface = {}) {
    return { password: data.password, userMetadata: data.userMetadata };
  }

  private async ensureUserExists(options: {
    ctx: PlainLiteralObject;
    userId: string;
    invitationId: string;
  }): Promise<boolean> {
    const user = await this.userModelService.byId(options.ctx, options.userId);
    if (!user) {
      this.logger.error('User not found for invitation', {
        userId: options.userId,
        invitationId: options.invitationId,
      });
      return false;
    }
    return true;
  }

  private async updateUserActivation(
    ctx: PlainLiteralObject,
    userId: string,
  ): Promise<void> {
    await this.userModelService.update(ctx, { id: userId, active: true });
    this.logger.debug('User activated', { userId });
  }

  /**
   * v8 keeps passwords in the user-credentials table: the password goes
   * through the same set-password port recovery uses (no current password
   * to verify — the invited account has none), never onto the user row.
   */
  private async setPassword(
    ctx: PlainLiteralObject,
    userId: string,
    password: InvitationAcceptanceDataInterface['password'],
  ): Promise<void> {
    if (!password || typeof password !== 'string') return;
    await this.commandBus.execute(
      new RocketsAuthSetPasswordPortCommand(ctx, password, userId),
    );
    this.logger.debug('Password set', { userId });
  }

  private async updateUserMetadata(options: {
    ctx: PlainLiteralObject;
    userId: string;
    userMetadata?: InvitationAcceptanceDataInterface['userMetadata'];
  }): Promise<void> {
    const { ctx, userId, userMetadata } = options;
    if (!userMetadata || Object.keys(userMetadata).length === 0) return;

    // Let `validateWithSchema`'s 400 propagate — the outer `txScope.run`
    // rolls back, and the outer catch logs.
    const metadata = toMetadataPatch(
      await validateWithSchema(
        this.config.userMetadataUpdateSchema,
        userMetadata,
      ),
    );

    await this.commandBus.execute(
      new SaveUserMetadataCommand(ctx, userId, metadata),
    );
    this.logger.log('User metadata created/updated successfully', { userId });
  }

  private async assignUserRole(
    ctx: PlainLiteralObject,
    userId: string,
    allowedRoleId?: string,
  ): Promise<void> {
    if (allowedRoleId) {
      await this.commandBus.execute(
        new AssignRoleCommand(ctx, USER_ROLE_ENTITY_KEY, allowedRoleId, userId),
      );
    } else {
      await this.commandBus.execute(new AssignDefaultRoleCommand(ctx, userId));
    }
  }

  private logAcceptanceSuccess(options: {
    invitationId: string;
    userId: string;
    category: string;
    roleId?: string;
  }): void {
    this.logger.debug('Role assigned successfully', {
      userId: options.userId,
      roleId: options.roleId || 'default',
    });
    this.logger.log('Invitation accepted successfully', {
      invitationId: options.invitationId,
      userId: options.userId,
      category: options.category,
    });
  }
}
