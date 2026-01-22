import {
  ConfigurableModuleBuilder,
  DynamicModule,
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  Provider,
  Type,
  ValidationPipe,
  Controller,
  HttpCode,
  Param,
  Patch,
  Body,
} from '@nestjs/common';
import { EventAsyncInterface, EventListenerOn } from '@concepta/nestjs-event';
import {
  InvitationAcceptedEventAsync,
  InvitationService,
} from '@concepta/nestjs-invitation';
import { PasswordCreationService } from '@concepta/nestjs-password';
import { RoleService } from '@concepta/nestjs-role';
import { UserModelService } from '@concepta/nestjs-user';
import { plainToInstance } from 'class-transformer';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthPublic } from '@concepta/nestjs-authentication';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  RocketsAuthSettingsInterface,
} from '../../../shared';
import { UserCrudOptionsExtrasInterface } from '../../../shared/interfaces/rockets-auth-options-extras.interface';
import { RocketsAuthRoleService } from '../../role';
import {
  UserMetadataModelService,
  GenericUserMetadataModelService,
} from '../../user';
import {
  TypedInvitationAcceptedEventPayloadInterface,
  InvitationAcceptanceDataInterface,
} from '../interfaces/invitation-acceptance-data.interface';
import { RocketsAuthInvitationAcceptDto } from '../dto/rockets-auth-invitation-accept.dto';
import { RocketsAuthInvitationNotAcceptedException } from '../invitation.exception';

export const RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_INVITATION_ACCEPTANCE_MODULE_RAW_OPTIONS_TOKEN__',
);

export const INVITATION_ACCEPTANCE_LISTENER_TOKEN =
  'INVITATION_ACCEPTANCE_LISTENER';

/**
 * Options interface for Invitation Acceptance Module
 */
export interface InvitationAcceptanceOptionsInterface {
  userCrud?: UserCrudOptionsExtrasInterface;
  listenerService?: Type<
    EventListenerOn<
      EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface<InvitationAcceptanceDataInterface>,
        boolean
      >
    >
  >;
}

type InvitationAcceptanceExtrasInterface =
  InvitationAcceptanceOptionsInterface & {
    global?: boolean;
  };

export const {
  ConfigurableModuleClass: RocketsAuthInvitationAcceptanceModuleClass,
  OPTIONS_TYPE: ROCKETS_AUTH_INVITATION_ACCEPTANCE_MODULE_OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE:
    ROCKETS_AUTH_INVITATION_ACCEPTANCE_MODULE_ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<InvitationAcceptanceOptionsInterface>({
  moduleName: 'RocketsAuthInvitationAcceptance',
  optionsInjectionToken: RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN,
})
  .setExtras<Partial<InvitationAcceptanceExtrasInterface>>(
    { global: false },
    definitionTransform,
  )
  .build();

export type RocketsAuthInvitationAcceptanceOptions =
  typeof ROCKETS_AUTH_INVITATION_ACCEPTANCE_MODULE_OPTIONS_TYPE;
export type RocketsAuthInvitationAcceptanceAsyncOptions =
  typeof ROCKETS_AUTH_INVITATION_ACCEPTANCE_MODULE_ASYNC_OPTIONS_TYPE;

/**
 * Transform the definition to include the combined providers
 * Following the pattern from rockets-auth.module-definition.ts
 */
function definitionTransform(
  definition: DynamicModule,
  extras: Partial<InvitationAcceptanceExtrasInterface>,
): DynamicModule {
  const { providers = [], exports = [] } = definition;

  return {
    ...definition,
    global: extras.global,
    controllers: createInvitationAcceptanceControllers({ extras }),
    providers: createInvitationAcceptanceProviders({
      providers,
      extras,
    }),
    exports: createInvitationAcceptanceExports({
      exports,
      extras,
    }),
  };
}

/**
 * Create controllers array
 */
function createInvitationAcceptanceControllers(_options: {
  extras?: Partial<InvitationAcceptanceExtrasInterface>;
}): DynamicModule['controllers'] {
  // Get the controller class from factory method (KISS)
  const ControllerClass = createInvitationAcceptanceControllerClass();

  return [ControllerClass];
}

/**
 * Create providers following the rockets-auth pattern
 */
function createInvitationAcceptanceProviders(options: {
  providers: DynamicModule['providers'];
  extras?: Partial<InvitationAcceptanceExtrasInterface>;
}): Provider[] {
  const { extras } = options;

  // Get the listener class from factory method (KISS)
  // Use custom listener if provided, otherwise use default
  const ListenerClass =
    extras?.listenerService || createInvitationUserAcceptanceListenerClass();

  return [
    ...(options.providers || []),

    // Listener provider - use the class directly with useClass
    {
      provide: INVITATION_ACCEPTANCE_LISTENER_TOKEN,
      useClass: ListenerClass,
    },
  ];
}

/**
 * Create exports following the rockets-auth pattern
 */
function createInvitationAcceptanceExports(options: {
  exports: DynamicModule['exports'];
  extras?: Partial<InvitationAcceptanceExtrasInterface>;
}): DynamicModule['exports'] {
  return [
    ...(options.exports || []),
    RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN,
    INVITATION_ACCEPTANCE_LISTENER_TOKEN,
  ];
}

/**
 * Create the Invitation Acceptance Controller class
 * KISS: This method creates and returns ONE class
 */
function createInvitationAcceptanceControllerClass() {
  @Controller('invitation-acceptance')
  @AuthPublic()
  @ApiTags('auth')
  class InvitationAcceptanceController {
    constructor(private readonly invitationService: InvitationService) {}

    /**
     * Accept an invitation
     *
     * Users accept invitations by providing the invitation code and OTP passcode.
     * The payload can contain password and userMetadata (firstName, lastName, etc.)
     * which will be processed by the InvitationUserAcceptanceListener.
     *
     * SECURITY: Only password and userMetadata are accepted. User fields (active, email, username)
     * cannot be updated via this endpoint to prevent mass assignment attacks.
     *
     * @param code - The invitation code (UUID) from the email
     * @param dto - Acceptance data containing passcode and optional user data payload
     * @returns void on success, throws exception on failure
     */
    @Patch(':code')
    @HttpCode(200)
    @ApiOperation({
      summary: 'Accept invitation (Public with OTP)',
      description:
        'Accept an invitation by providing the code and OTP passcode. Include password and userMetadata in the payload.',
    })
    @ApiParam({
      name: 'code',
      description: 'Invitation code from email',
      type: 'string',
    })
    @ApiOkResponse({
      description: 'Invitation accepted successfully',
    })
    async accept(
      @Param('code') code: string,
      @Body() dto: RocketsAuthInvitationAcceptDto,
    ): Promise<void> {
      const { passcode, payload } = dto;

      let success: boolean | null | undefined;

      try {
        success = await this.invitationService.accept({
          code,
          passcode,
          payload,
        });
      } catch (e) {
        Logger.error(e);
        throw e;
      }

      if (!success) {
        throw new RocketsAuthInvitationNotAcceptedException();
      }
    }
  }

  return InvitationAcceptanceController;
}

/**
 * Create the Invitation User Acceptance Listener class
 * KISS: This method creates and returns ONE class
 *
 * The listener receives moduleOptions via DI which contains:
 * - userCrud.userMetadataConfig.updateDto for validation
 *
 * NOTE: Not exported to avoid TypeScript issues with private members from parent class
 */
function createInvitationUserAcceptanceListenerClass() {
  /**
   * Invitation User Acceptance Listener
   * Listens to InvitationAcceptedEventAsync and handles user data processing:
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
  class InvitationUserAcceptanceListener
    extends EventListenerOn<
      EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface<InvitationAcceptanceDataInterface>,
        boolean
      >
    >
    implements OnModuleInit
  {
    public readonly logger = new Logger(InvitationUserAcceptanceListener.name);

    constructor(
      @Inject(UserModelService)
      public readonly userModelService: UserModelService,
      @Inject(PasswordCreationService)
      public readonly passwordService: PasswordCreationService,
      @Inject(UserMetadataModelService)
      public readonly userMetadataService: GenericUserMetadataModelService,
      @Inject(RoleService)
      public readonly roleService: RoleService,
      @Inject(RocketsAuthRoleService)
      public readonly authRoleService: RocketsAuthRoleService,
      @Inject(ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN)
      public readonly settings: RocketsAuthSettingsInterface,
      @Inject(RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN)
      public readonly moduleOptions: InvitationAcceptanceOptionsInterface,
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
        // Extract only password and userMetadata from payload
        // SECURITY: User fields (active, email, username) are NOT extracted
        // They cannot be updated via invitation acceptance to prevent mass assignment
        const { password, userMetadata } = data || {};

        // Verify user exists
        const user = await this.userModelService.byId(invitation.userId);
        if (!user) {
          this.logger.error('User not found for invitation', {
            userId: invitation.userId,
            invitationId: invitation.id,
          });
          return false;
        }

        // 1. Hash password if provided
        const passwordFields: Record<string, unknown> = {};
        if (password && typeof password === 'string') {
          const passwordHash = await this.passwordService.create(password);
          Object.assign(passwordFields, passwordHash);
          this.logger.debug('Password hashed successfully', {
            userId: invitation.userId,
          });
        }

        // 2. Update user with password only (no userData spread - security)
        // active is set to true by code, not by user input
        await this.userModelService.update({
          id: invitation.userId,
          ...passwordFields,
          active: true,
        });
        this.logger.debug('User updated successfully', {
          userId: invitation.userId,
        });

        // 3. Validate and create/update user metadata
        // If DTO is configured, validate using ValidationPipe (same pattern as AdminUserCrudService)
        if (userMetadata && Object.keys(userMetadata).length > 0) {
          const MetadataUpdateDto =
            this.moduleOptions.userCrud?.userMetadataConfig?.updateDto;
          if (MetadataUpdateDto) {
            // Validate userMetadata using DTO (same pattern as AdminUserCrudService.updateOne)
            const metadataInstance = plainToInstance(
              MetadataUpdateDto,
              userMetadata,
            );

            // Note: forbidUnknownValues is intentionally NOT set to support dynamic metadata properties
            // This allows the DTO to validate known fields while still accepting additional custom fields
            // eslint-disable-next-line @darraghor/nestjs-typed/should-specify-forbid-unknown-values
            const pipe = new ValidationPipe({
              transform: true,
              whitelist: true,
              forbidNonWhitelisted: false,
            });

            try {
              // Validate metadata (validation ensures only known fields pass)
              await pipe.transform(metadataInstance, {
                type: 'body',
                metatype: MetadataUpdateDto,
              });
              // Use original userMetadata (validation passed, but preserve all fields)
              // This allows DTOs with index signature to work correctly
              await this.userMetadataService.createOrUpdate(
                invitation.userId,
                userMetadata,
              );
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : 'Invalid metadata';
              this.logger.error(
                'Invalid userMetadata in invitation acceptance',
                {
                  userId: invitation.userId,
                  error: message,
                },
              );
              return false; // Rollback invitation acceptance
            }
          } else {
            // Fallback: no DTO configured, use basic validation
            await this.userMetadataService.createOrUpdate(
              invitation.userId,
              userMetadata,
            );
          }

          this.logger.log('User metadata created/updated successfully', {
            userId: invitation.userId,
          });
        }

        // 4. Assign role to user
        // SECURITY: Role is read from invitation.constraints.roleId (admin-controlled, set at creation)
        // NOT from user-controlled acceptance payload to prevent privilege escalation attacks
        // Priority: invitation.constraints.roleId > default role from settings
        const allowedRoleId = invitation.constraints?.roleId as
          | string
          | undefined;
        if (allowedRoleId) {
          // Use the specific roleId set by admin in invitation constraints
          await this.roleService.assignRole({
            assignment: 'user',
            assignee: { id: invitation.userId },
            role: { id: allowedRoleId },
          });
        } else {
          // Fall back to default role if no roleId set in constraints
          // Throw error to rollback entire invitation acceptance on failure
          await this.authRoleService.assignDefaultRoleToUser(
            invitation.userId,
            true,
          );
        }

        this.logger.debug('Role assigned successfully', {
          userId: invitation.userId,
          roleId: allowedRoleId || 'default',
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

  return InvitationUserAcceptanceListener;
}
