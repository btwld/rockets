import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus, EventsHandler, IEventHandler } from '@nestjs/cqrs';

import { PasswordCreationService } from '@concepta/nestjs-password';
import { TransactionScope } from '@concepta/nestjs-repository';
import { AssignRoleCommand } from '@concepta/nestjs-role';
import { InvitationAcceptedEvent } from '@concepta/nestjs-invitation';

import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
} from '../../../../shared/ports/rockets-auth-user-port.service';
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
import { whitelistedFromDto } from '@bitwild/rockets-common';

/**
 * Invitation User Acceptance Listener
 * Handles CQRS {@link InvitationAcceptedEvent} from `@concepta/nestjs-invitation` v8:
 * - Hashes password if provided
 * - Creates or updates user metadata (validated with DTO if configured)
 * - Assigns role (from invitation.constraints.roleId set at creation, or default role)
 *
 * SECURITY:
 * - Role assignment is admin-controlled via invitation.constraints.roleId
 * - Only userMetadata is updatable by user (validated with DTO)
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
    @Inject(PasswordCreationService)
    public readonly passwordService: PasswordCreationService,
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
    const txCtx = {
      source: 'invitation-acceptance',
      invitationId: invitation.id,
      userId: invitation.userId,
      category: invitation.category,
    };
    try {
      await this.txScope.run(txCtx, async () => {
        const { password, userMetadata } =
          this.extractAcceptedData(acceptanceData);

        const userExists = await this.ensureUserExists({
          userId: invitation.userId,
          invitationId: invitation.id,
        });
        if (!userExists) return;

        const passwordFields = await this.getPasswordFields(
          password,
          invitation.userId,
        );
        await this.updateUserActivation(invitation.userId, passwordFields);

        await this.updateUserMetadata({
          userId: invitation.userId,
          userMetadata,
        });

        const allowedRoleId = invitation.constraints?.roleId as
          | string
          | undefined;
        await this.assignUserRole(invitation.userId, allowedRoleId);
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
    userId: string;
    invitationId: string;
  }): Promise<boolean> {
    const user = await this.userModelService.byId(options.userId);
    if (!user) {
      this.logger.error('User not found for invitation', {
        userId: options.userId,
        invitationId: options.invitationId,
      });
      return false;
    }
    return true;
  }

  private async getPasswordFields(
    password: InvitationAcceptanceDataInterface['password'],
    userId: string,
  ): Promise<Record<string, unknown>> {
    if (!password || typeof password !== 'string') return {};
    const passwordHash = await this.passwordService.create(password);
    this.logger.debug('Password hashed successfully', { userId });
    return { ...passwordHash };
  }

  private async updateUserActivation(
    userId: string,
    passwordFields: Record<string, unknown>,
  ): Promise<void> {
    await this.userModelService.update({
      id: userId,
      ...passwordFields,
      active: true,
    });
    this.logger.debug('User updated successfully', { userId });
  }

  private async updateUserMetadata(options: {
    userId: string;
    userMetadata?: InvitationAcceptanceDataInterface['userMetadata'];
  }): Promise<void> {
    const { userId, userMetadata } = options;
    if (!userMetadata || Object.keys(userMetadata).length === 0) return;

    const MetadataUpdateDto = this.config.userMetadataUpdateDto;
    let metadata: RocketsAuthUserMetadataUpdatableInterface = userMetadata;
    if (MetadataUpdateDto) {
      // Let `whitelistedFromDto`'s validation exception propagate — the
      // outer `txScope.run` rolls back, and the outer catch logs.
      metadata = await whitelistedFromDto<
        RocketsAuthUserMetadataUpdatableInterface & Record<string, unknown>
      >(MetadataUpdateDto, userMetadata as object);
    }

    await this.commandBus.execute(
      new SaveUserMetadataCommand(userId, metadata),
    );
    this.logger.log('User metadata created/updated successfully', { userId });
  }

  private async assignUserRole(
    userId: string,
    allowedRoleId?: string,
  ): Promise<void> {
    if (allowedRoleId) {
      await this.commandBus.execute(
        new AssignRoleCommand({}, USER_ROLE_ENTITY_KEY, allowedRoleId, userId),
      );
    } else {
      await this.commandBus.execute(new AssignDefaultRoleCommand(userId));
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
