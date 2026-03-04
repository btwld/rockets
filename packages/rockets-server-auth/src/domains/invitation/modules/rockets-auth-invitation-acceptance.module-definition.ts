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
} from '@nestjs/common';
import { EventAsyncInterface, EventListenerOn } from '@concepta/nestjs-event';
import { InvitationAcceptedEventAsync } from '@concepta/nestjs-invitation';
import { PasswordCreationService } from '@concepta/nestjs-password';
import { RoleService } from '@concepta/nestjs-role';
import { UserModelService } from '@concepta/nestjs-user';
import { plainToInstance } from 'class-transformer';
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
import { InvitationAcceptanceController } from '../controllers/invitation-acceptance.controller';

export const RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN = Symbol(
  '__ROCKETS_INVITATION_ACCEPTANCE_MODULE_RAW_OPTIONS_TOKEN__',
);

export const INVITATION_ACCEPTANCE_LISTENER_TOKEN =
  'INVITATION_ACCEPTANCE_LISTENER';

type InvitationAcceptanceEvent = EventAsyncInterface<
  TypedInvitationAcceptedEventPayloadInterface<InvitationAcceptanceDataInterface>,
  boolean
>;

/**
 * Options interface for Invitation Acceptance Module
 */
export interface InvitationAcceptanceOptionsInterface {
  userCrud?: UserCrudOptionsExtrasInterface;
  listenerService?: Type<EventListenerOn<InvitationAcceptanceEvent>>;
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
  return [InvitationAcceptanceController];
}

/**
 * Create providers following the rockets-auth pattern
 */
function createInvitationAcceptanceProviders(options: {
  providers: Provider[];
  extras?: Partial<InvitationAcceptanceExtrasInterface>;
}): Provider[] {
  const { extras } = options;

  // Get the listener class from factory method (KISS)
  // Use custom listener if provided, otherwise use default
  const ListenerClass =
    extras?.listenerService || createInvitationUserAcceptanceListenerClass();

  return [
    ...options.providers,

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
  exports: Exclude<DynamicModule['exports'], undefined>;
  extras?: Partial<InvitationAcceptanceExtrasInterface>;
}): DynamicModule['exports'] {
  return [
    ...options.exports,
    RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN,
    INVITATION_ACCEPTANCE_LISTENER_TOKEN,
  ];
}

/**
 * Create the Invitation User Acceptance Listener class.
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
    async listen(event: InvitationAcceptanceEvent): Promise<boolean> {
      const { invitation, data } = event.payload;

      if (invitation.category !== 'user') {
        return true;
      }

      try {
        const { password, userMetadata } = this.extractAcceptedData(data);

        const userExists = await this.ensureUserExists({
          userId: invitation.userId,
          invitationId: invitation.id,
        });
        if (!userExists) {
          return false;
        }

        const passwordFields = await this.getPasswordFields(
          password,
          invitation.userId,
        );
        await this.updateUserActivation(invitation.userId, passwordFields);

        const metadataSaved = await this.updateUserMetadata({
          userId: invitation.userId,
          userMetadata,
        });
        if (!metadataSaved) {
          return false;
        }

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

        return true;
      } catch (error) {
        this.logger.error('Failed to process invitation acceptance', {
          invitationId: invitation.id,
          userId: invitation.userId,
          category: invitation.category,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }

    private extractAcceptedData(data: InvitationAcceptanceDataInterface = {}) {
      return {
        password: data.password,
        userMetadata: data.userMetadata,
      };
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
      if (!password || typeof password !== 'string') {
        return {};
      }

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
    }): Promise<boolean> {
      const { userId, userMetadata } = options;
      if (!userMetadata || Object.keys(userMetadata).length === 0) {
        return true;
      }

      const MetadataUpdateDto =
        this.moduleOptions.userCrud?.userMetadataConfig?.updateDto;

      if (!MetadataUpdateDto) {
        await this.userMetadataService.createOrUpdate(userId, userMetadata);
        this.logger.log('User metadata created/updated successfully', {
          userId,
        });
        return true;
      }

      try {
        const metadataInstance = plainToInstance(
          MetadataUpdateDto,
          userMetadata,
        );
        // eslint-disable-next-line @darraghor/nestjs-typed/should-specify-forbid-unknown-values
        const pipe = new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: false,
        });
        await pipe.transform(metadataInstance, {
          type: 'body',
          metatype: MetadataUpdateDto,
        });
        await this.userMetadataService.createOrUpdate(userId, userMetadata);
        this.logger.log('User metadata created/updated successfully', {
          userId,
        });
        return true;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Invalid metadata';
        this.logger.error('Invalid userMetadata in invitation acceptance', {
          userId,
          error: message,
        });
        return false;
      }
    }

    private async assignUserRole(
      userId: string,
      allowedRoleId?: string,
    ): Promise<void> {
      if (allowedRoleId) {
        await this.roleService.assignRole({
          assignment: 'user',
          assignee: { id: userId },
          role: { id: allowedRoleId },
        });
      } else {
        await this.authRoleService.assignDefaultRoleToUser(userId, true);
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

  return InvitationUserAcceptanceListener;
}
