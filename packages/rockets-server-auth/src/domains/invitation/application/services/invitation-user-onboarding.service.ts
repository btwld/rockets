import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { PlainLiteralObject } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';

import { AssignRoleCommand } from '@concepta/nestjs-role';
import type { InvitationAcceptedEvent } from '@concepta/nestjs-invitation';
import { validateWithSchema } from '@concepta/rockets-core';

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
import { RocketsAuthInvitationUserMissingException } from '../../domain/exceptions/invitation.exception';
import {
  InvitationAcceptanceConfig,
  INVITATION_ACCEPTANCE_CONFIG_TOKEN,
} from '../../infrastructure/config/invitation-acceptance.config';

export const INVITATION_USER_ONBOARDING_SERVICE_TOKEN = Symbol(
  '__ROCKETS_INVITATION_USER_ONBOARDING_SERVICE_TOKEN__',
);

/**
 * Onboards the invited account once the invitation is accepted.
 *
 * Runs INSIDE the acceptance transaction (see
 * `RocketsAcceptInvitationHandler`), so it takes the caller's `ctx` and
 * never opens a scope of its own, and it never swallows: a failure here
 * rolls the acceptance back, leaving the invitation pending so the invitee
 * can retry. It used to be a post-commit `InvitationAcceptedEvent` listener
 * that logged its failures, which burned the invitation and left the
 * account inactive with no way back.
 */
export interface InvitationUserOnboardingServiceInterface {
  onAccepted(
    ctx: PlainLiteralObject,
    invitation: InvitationAcceptedEvent['invitation'],
    payload?: InvitationAcceptedEvent['payload'],
  ): Promise<void>;
}

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
 * Default {@link InvitationUserOnboardingServiceInterface}:
 * - activates the invited account
 * - sets the supplied password through the user-credentials port
 * - creates or updates user metadata (always validated with the update
 *   schema — the app's, or the base default that strips every key)
 * - assigns the role from `invitation.constraints.roleId`, else the default
 *
 * SECURITY:
 * - Role assignment is admin-controlled via `invitation.constraints.roleId`
 * - Only `userMetadata` is updatable by the invitee (validated with the
 *   update schema; there is no unvalidated path, so a smuggled `userId`
 *   never reaches the row)
 * - User fields (active, email, username) are blocked from user updates
 */
@Injectable()
export class InvitationUserOnboardingService
  implements InvitationUserOnboardingServiceInterface
{
  protected readonly logger = new Logger(InvitationUserOnboardingService.name);

  constructor(
    @Inject(ROCKETS_AUTH_USER_PORT_TOKEN)
    protected readonly userModelService: RocketsAuthUserPortService,
    protected readonly commandBus: CommandBus,
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    protected readonly settings: RocketsAuthSettingsInterface,
    @Inject(INVITATION_ACCEPTANCE_CONFIG_TOKEN)
    protected readonly config: InvitationAcceptanceConfig,
  ) {}

  async onAccepted(
    ctx: PlainLiteralObject,
    invitation: InvitationAcceptedEvent['invitation'],
    payload?: InvitationAcceptedEvent['payload'],
  ): Promise<void> {
    if (invitation.category !== 'user') {
      return;
    }

    const { password, userMetadata } = this.extractAcceptedData(
      payload as InvitationAcceptanceDataInterface | undefined,
    );

    await this.ensureUserExists(ctx, invitation.userId);
    await this.updateUserActivation(ctx, invitation.userId);
    await this.setPassword(ctx, invitation.userId, password);
    await this.updateUserMetadata({
      ctx,
      userId: invitation.userId,
      userMetadata,
    });

    const allowedRoleId = invitation.constraints?.roleId as string | undefined;
    await this.assignUserRole(ctx, invitation.userId, allowedRoleId);

    this.logAcceptanceSuccess({
      invitationId: invitation.id,
      userId: invitation.userId,
      category: invitation.category,
      roleId: allowedRoleId,
    });
  }

  private extractAcceptedData(data: InvitationAcceptanceDataInterface = {}) {
    return { password: data.password, userMetadata: data.userMetadata };
  }

  /**
   * The invitation row points at a user that must exist — creation happens
   * at invite time, in the invitation's own transaction. A missing user is
   * a broken invariant, not a branch to log past.
   */
  private async ensureUserExists(
    ctx: PlainLiteralObject,
    userId: string,
  ): Promise<void> {
    const user = await this.userModelService.byId(ctx, userId);
    if (!user) {
      this.logger.error('User not found for accepted invitation', { userId });
      throw new RocketsAuthInvitationUserMissingException();
    }
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
