import { Test, TestingModule } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';

import { PasswordCreationService } from '@concepta/nestjs-password';
import { TransactionScope } from '@concepta/nestjs-repository';
import { CommandBus, EventsHandler, IEventHandler } from '@nestjs/cqrs';
import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
} from '../../../shared/ports/rockets-auth-user-port.service';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  ROCKETS_AUTH_OTP_ASSIGNMENT,
} from '../../../shared/constants/rockets-auth.constants';
import { InvitationAcceptanceDataInterface } from '../interfaces/invitation-acceptance-data.interface';
import {
  InvitationAcceptedEvent,
  InvitationInterface,
} from '@concepta/nestjs-invitation';
import { ReferenceIdInterface } from '@concepta/nestjs-common';
import {
  INVITATION_ACCEPTANCE_LISTENER_TOKEN,
  RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN,
} from '../modules/rockets-auth-invitation-acceptance.module-definition';
import { RocketsAuthInvitationAcceptanceModule } from '../modules/rockets-auth-invitation-acceptance.module';
import { AssignDefaultRoleCommand } from '../../user/application/commands/impl/assign-default-role.command';
import { SaveUserMetadataCommand } from '../../user/application/commands/impl/save-user-metadata.command';
import { InvitationUserAcceptanceListener } from '../application/listeners/invitation-user-acceptance.listener';

function createInvitationAcceptedEvent(
  invitation: ReferenceIdInterface & InvitationInterface,
  data?: InvitationAcceptanceDataInterface,
): InvitationAcceptedEvent {
  return new InvitationAcceptedEvent({} as never, invitation as never, data);
}

describe('InvitationUserAcceptanceListener', () => {
  let listener: InvitationUserAcceptanceListener;
  let mockUserPortService: jest.Mocked<
    Pick<RocketsAuthUserPortService, 'byId' | 'update'>
  >;
  let mockPasswordService: jest.Mocked<PasswordCreationService>;
  let mockCommandBus: jest.Mocked<Pick<CommandBus, 'execute'>>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    active: false,
  };

  const mockInvitation: ReferenceIdInterface & InvitationInterface = {
    id: 'invitation-123',
    code: 'abc-123',
    userId: 'user-123',
    category: 'user',
    constraints: {},
    dateAccepted: null,
    dateRevoked: null,
  };

  const mockSettings = {
    role: {
      adminRoleName: 'admin',
      defaultUserRoleName: 'user',
    },
    email: {
      from: 'noreply@example.com',
      baseUrl: 'http://localhost:3000',
      templates: {
        sendOtp: {
          fileName: 'send-otp.template.hbs',
          subject: 'OTP',
        },
        invitation: {
          logo: '',
          fileName: 'invitation.template.hbs',
          subject: 'Invitation',
        },
        invitationAccepted: {
          logo: '',
          fileName: 'invitation-accepted.template.hbs',
          subject: 'Invitation Accepted',
        },
      },
    },
    otp: {
      assignment: ROCKETS_AUTH_OTP_ASSIGNMENT,
      category: 'auth-login',
      type: 'uuid',
      expiresIn: '1h',
    },
  };

  beforeEach(async () => {
    mockUserPortService = {
      byId: jest.fn(),
      update: jest.fn(),
    } as jest.Mocked<Pick<RocketsAuthUserPortService, 'byId' | 'update'>>;

    mockPasswordService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<PasswordCreationService>;

    mockCommandBus = {
      execute: jest.fn(),
    } as jest.Mocked<Pick<CommandBus, 'execute'>>;

    // Pass-through TransactionScope mock — runs the callback in-place so
    // assertions on side effects still work, and re-throws on failure so the
    // outer catch in the listener receives the error.
    const txScopeMock = {
      run: jest.fn(
        async (_ctx: unknown, fn: () => Promise<unknown>) => await fn(),
      ),
    } as unknown as TransactionScope;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ROCKETS_AUTH_USER_PORT_TOKEN,
          useValue: mockUserPortService,
        },
        {
          provide: PasswordCreationService,
          useValue: mockPasswordService,
        },
        {
          provide: CommandBus,
          useValue: mockCommandBus,
        },
        {
          provide: ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
          useValue: mockSettings,
        },
        {
          provide: TransactionScope,
          useValue: txScopeMock,
        },
        // Provide the listener via the factory (simulating the module definition)
        {
          provide: RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN,
          useValue: {}, // Empty options for testing
        },
        // Import the module to get the listener
        ...(RocketsAuthInvitationAcceptanceModule.forRoot({}).providers || []),
      ],
    }).compile();

    listener = module.get<InvitationUserAcceptanceListener>(
      INVITATION_ACCEPTANCE_LISTENER_TOKEN,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handle', () => {
    it('should skip processing for non-user category invitations', async () => {
      const event = createInvitationAcceptedEvent(
        { ...mockInvitation, category: 'org' },
        {},
      );

      await listener.handle(event);

      expect(mockUserPortService.byId).not.toHaveBeenCalled();
    });

    it('should process user invitation with password successfully', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, {
        password: 'Test123!',
        firstName: 'John',
        lastName: 'Doe',
      });

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await listener.handle(event);

      expect(mockUserPortService.byId).toHaveBeenCalledWith('user-123');
      expect(mockPasswordService.create).toHaveBeenCalledWith('Test123!');
      expect(mockUserPortService.update).toHaveBeenCalledWith({
        id: 'user-123',
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
        active: true,
      });
      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.any(AssignDefaultRoleCommand),
      );
    });

    it('should process invitation without password', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, {
        firstName: 'John',
        lastName: 'Doe',
      });

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await listener.handle(event);

      expect(mockPasswordService.create).not.toHaveBeenCalled();
      expect(mockUserPortService.update).toHaveBeenCalledWith({
        id: 'user-123',
        active: true,
      });
    });

    it('should create user metadata when provided', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, {
        password: 'Test123!',
        userMetadata: {
          bio: 'Test bio',
          phoneNumber: '+1234567890',
        },
      });

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await listener.handle(event);

      const metadataCall = mockCommandBus.execute.mock.calls.find(
        (call: unknown[]) => call[0] instanceof SaveUserMetadataCommand,
      );
      expect(metadataCall).toBeDefined();
      expect(metadataCall![0]).toEqual(
        expect.objectContaining({
          userId: 'user-123',
          data: {
            bio: 'Test bio',
            phoneNumber: '+1234567890',
          },
        }),
      );
    });

    it('should assign specific roleId from invitation constraints', async () => {
      const event = createInvitationAcceptedEvent(
        {
          ...mockInvitation,
          constraints: { roleId: 'role-123' },
        },
        {
          password: 'Test123!',
        },
      );

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await listener.handle(event);

      expect(mockCommandBus.execute).toHaveBeenCalled();
    });

    it('should ignore roleId from acceptance payload (security test)', async () => {
      const event = createInvitationAcceptedEvent(
        {
          ...mockInvitation,
          constraints: { roleId: 'admin-role-123' },
        },
        {
          password: 'Test123!',
          roleId: 'user-role-456',
        },
      );

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await listener.handle(event);

      expect(mockCommandBus.execute).toHaveBeenCalled();
    });

    it('should assign default role when roleId not in constraints', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, {
        password: 'Test123!',
      });

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await listener.handle(event);

      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.any(AssignDefaultRoleCommand),
      );
    });

    it('should stop when user not found', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, {
        password: 'Test123!',
      });

      mockUserPortService.byId.mockResolvedValue(null as never);

      await listener.handle(event);

      expect(mockUserPortService.byId).toHaveBeenCalledWith('user-123');
      expect(mockPasswordService.create).not.toHaveBeenCalled();
      expect(mockUserPortService.update).not.toHaveBeenCalled();
    });

    it('should catch error when password creation fails', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, {
        password: 'Test123!',
      });

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockRejectedValue(
        new Error('Password hash failed'),
      );

      await listener.handle(event);

      expect(mockUserPortService.update).not.toHaveBeenCalled();
    });

    it('should catch error when user update fails', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, {
        password: 'Test123!',
      });

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockRejectedValue(new Error('Update failed'));

      await listener.handle(event);

      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });

    it('should catch error when role assignment fails', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, {
        password: 'Test123!',
      });

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockRejectedValue(
        new Error('Role assignment failed'),
      );

      await listener.handle(event);
    });

    it('should handle empty data payload', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, {});

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await listener.handle(event);

      expect(mockPasswordService.create).not.toHaveBeenCalled();
    });

    it('should handle undefined data payload', async () => {
      const event = createInvitationAcceptedEvent(mockInvitation, undefined);

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      await listener.handle(event);
    });
  });

  describe('Custom listener override', () => {
    it('should allow custom listener service to be used', async () => {
      @Injectable()
      @EventsHandler(InvitationAcceptedEvent)
      class CustomInvitationUserAcceptanceListener
        implements IEventHandler<InvitationAcceptedEvent>
      {
        async handle(_event: InvitationAcceptedEvent): Promise<void> {}
      }

      const customModule = await Test.createTestingModule({
        providers: [
          {
            provide: ROCKETS_AUTH_USER_PORT_TOKEN,
            useValue: mockUserPortService,
          },
          {
            provide: PasswordCreationService,
            useValue: mockPasswordService,
          },
          {
            provide: CommandBus,
            useValue: mockCommandBus,
          },
          {
            provide: ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
            useValue: mockSettings,
          },
          CustomInvitationUserAcceptanceListener,
          {
            provide: INVITATION_ACCEPTANCE_LISTENER_TOKEN,
            useExisting: CustomInvitationUserAcceptanceListener,
          },
        ],
      }).compile();

      const customListener = customModule.get<
        IEventHandler<InvitationAcceptedEvent>
      >(INVITATION_ACCEPTANCE_LISTENER_TOKEN);

      const event = createInvitationAcceptedEvent(mockInvitation, {
        password: 'Test123!',
      });

      await customListener.handle(event);

      expect(customListener).toBeInstanceOf(
        CustomInvitationUserAcceptanceListener,
      );
      expect(mockUserPortService.byId).not.toHaveBeenCalled();
    });
  });
});
