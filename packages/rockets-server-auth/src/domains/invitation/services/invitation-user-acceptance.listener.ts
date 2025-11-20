import {
  Injectable,
  Inject,
  OnModuleInit,
  Logger,
  Optional,
} from '@nestjs/common';
import { EventListenerOn, EventAsyncInterface } from '@concepta/nestjs-event';
import { InvitationAcceptedEventAsync } from '@concepta/nestjs-invitation';
import { UserModelService } from '@concepta/nestjs-user';
import { PasswordCreationService } from '@concepta/nestjs-password';
import { RoleService } from '@concepta/nestjs-role';
import { GenericUserMetadataModelService } from '../../user/services/rockets-auth-user-metadata.model.service';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../../../shared/constants/rockets-auth.constants';
import { RocketsAuthSettingsInterface } from '../../../shared/interfaces/rockets-auth-settings.interface';
import { AuthUserMetadataModelService } from '../../user/constants/user-metadata.constants';
import {
  InvitationAcceptanceDataInterface,
  TypedInvitationAcceptedEventPayloadInterface,
} from '../interfaces/invitation-acceptance-data.interface';
import { RocketsAuthRoleService } from '../../role/services/rockets-auth-role.service';

/**
 * Invitation User Acceptance Listener
 *
 * Listens to InvitationAcceptedEventAsync and handles user data processing:
 * - Updates user with provided data (firstName, lastName, etc.)
 * - Hashes password if provided
 * - Creates or updates user metadata
 * - Assigns role (specific roleId from payload or default role if configured)
 *
 * This follows the same pattern as rockets-auth-signup.module.ts
 */
@Injectable()
export class InvitationUserAcceptanceListener
  extends EventListenerOn<
    EventAsyncInterface<
      TypedInvitationAcceptedEventPayloadInterface<InvitationAcceptanceDataInterface>,
      boolean
    >
  >
  implements OnModuleInit
{
  private readonly logger = new Logger(InvitationUserAcceptanceListener.name);

  constructor(
    @Inject(UserModelService)
    private readonly userModelService: UserModelService,
    @Inject(PasswordCreationService)
    private readonly passwordService: PasswordCreationService,
    @Optional()
    @Inject(AuthUserMetadataModelService)
    private readonly userMetadataService: GenericUserMetadataModelService | null,
    @Inject(RoleService)
    private readonly roleService: RoleService,
    @Inject(RocketsAuthRoleService)
    private readonly authRoleService: RocketsAuthRoleService,
    @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
    private readonly settings: RocketsAuthSettingsInterface,
  ) {
    super();
  }

  /**
   * Register this listener on module initialization
   */
  onModuleInit(): void {
    this.on(InvitationAcceptedEventAsync);
  }

  /**
   * Process invitation acceptance event
   *
   * @param event - The invitation accepted event containing invitation and user data
   * @returns true if successful, false if failed (causes rollback)
   */
  async listen(
    event: EventAsyncInterface<
      TypedInvitationAcceptedEventPayloadInterface<InvitationAcceptanceDataInterface>,
      boolean
    >,
  ): Promise<boolean> {
    const { invitation, data } = event.payload;

    // Only handle 'user' category invitations
    // Other categories can have their own listeners
    if (invitation.category !== 'user') {
      return true; // Let other listeners handle other categories
    }

    try {
      // Extract password, userMetadata (including firstName/lastName), and roleId from payload
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const {
        password,
        userMetadata = {},
        roleId,
        firstName,
        lastName,
        ...userData
      } = data || {};

      // firstName and lastName belong to userMetadata, not user
      const completeUserMetadata: Record<string, unknown> = {
        ...userMetadata,
      };

      if (firstName) completeUserMetadata.firstName = firstName;
      if (lastName) completeUserMetadata.lastName = lastName;

      // Verify user exists
      const user = await this.userModelService.byId(invitation.userId);
      if (!user) {
        this.logger.error('User not found for invitation', {
          userId: invitation.userId,
          invitationId: invitation.id,
        });
        return false;
      }

      // 1. Hash password if provided (following signup pattern)
      const passwordFields: Record<string, unknown> = {};
      if (password && typeof password === 'string') {
        const passwordHash = await this.passwordService.create(password);
        Object.assign(passwordFields, passwordHash);
        this.logger.debug('Password hashed successfully', {
          userId: invitation.userId,
        });
      }

      // 2. Update user with provided data
      await this.userModelService.update({
        id: invitation.userId,
        ...userData,
        ...passwordFields,
      });
      this.logger.debug('User updated successfully', {
        userId: invitation.userId,
      });

      // 3. Create or update user metadata (includes firstName, lastName, bio, etc.)
      if (
        completeUserMetadata &&
        Object.keys(completeUserMetadata).length > 0
      ) {
        if (this.userMetadataService) {
          await this.userMetadataService.createOrUpdate(
            invitation.userId,
            completeUserMetadata,
          );
          this.logger.log('User metadata created/updated successfully', {
            userId: invitation.userId,
          });
        } else {
          this.logger.warn(
            'UserMetadata service not available, skipping metadata update',
            {
              userId: invitation.userId,
            },
          );
        }
      }

      // 4. Assign role to user
      // Priority: roleId from payload > default role from settings
      if (roleId) {
        // Use the specific roleId provided in the payload
        await this.roleService.assignRole({
          assignment: 'user',
          assignee: { id: invitation.userId },
          role: { id: roleId },
        });
      } else {
        // Fall back to default role if no roleId provided
        // Throw error to rollback entire invitation acceptance on failure
        await this.authRoleService.assignDefaultRoleToUser(
          invitation.userId,
          true,
        );
      }

      this.logger.debug('Role assigned successfully', {
        userId: invitation.userId,
        roleId: roleId || 'default',
      });

      this.logger.log('Invitation accepted successfully', {
        invitationId: invitation.id,
        userId: invitation.userId,
        category: invitation.category,
      });

      return true; // Success - invitation will be accepted
    } catch (error) {
      this.logger.error('Failed to process invitation acceptance', {
        invitationId: invitation.id,
        userId: invitation.userId,
        category: invitation.category,
        error: error instanceof Error ? error.message : String(error),
      });
      return false; // Failure - will rollback invitation acceptance
    }
  }
}
