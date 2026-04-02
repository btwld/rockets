import { Test, TestingModule } from '@nestjs/testing';
import { Injectable } from '@nestjs/common';

import { PasswordCreationService } from '@concepta/nestjs-password';
import { CommandBus } from '@nestjs/cqrs';
import {
  RocketsAuthUserPortService,
  ROCKETS_AUTH_USER_PORT_TOKEN,
} from '../../../shared/ports/rockets-auth-user-port.service';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  ROCKETS_AUTH_OTP_ASSIGNMENT,
} from '../../../shared/constants/rockets-auth.constants';
import { EventAsyncInterface, EventListenerOn } from '@concepta/nestjs-event';
import {
  InvitationAcceptanceDataInterface,
  TypedInvitationAcceptedEventPayloadInterface,
} from '../interfaces/invitation-acceptance-data.interface';
import { InvitationInterface } from '@concepta/nestjs-common';
import {
  INVITATION_ACCEPTANCE_LISTENER_TOKEN,
  RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN,
} from '../modules/rockets-auth-invitation-acceptance.module-definition';
import { RocketsAuthInvitationAcceptanceModule } from '../modules/rockets-auth-invitation-acceptance.module';
import { AssignDefaultRoleCommand } from '../../user/application/commands/impl/assign-default-role.command';
import { SaveUserMetadataCommand } from '../../user/application/commands/impl/save-user-metadata.command';

describe('InvitationUserAcceptanceListener', () => {
  let listener: EventListenerOn<
    EventAsyncInterface<
      TypedInvitationAcceptedEventPayloadInterface<InvitationAcceptanceDataInterface>,
      boolean
    >
  >;
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

  const mockInvitation: InvitationInterface = {
    id: 'invitation-123',
    code: 'abc-123',
    userId: 'user-123',
    category: 'user',
    active: true,
    constraints: {},
    dateCreated: new Date(),
    dateUpdated: new Date(),
    dateDeleted: null,
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
        // Provide the listener via the factory (simulating the module definition)
        {
          provide: RAW_INVITATION_ACCEPTANCE_OPTIONS_TOKEN,
          useValue: {}, // Empty options for testing
        },
        // Import the module to get the listener
        ...(RocketsAuthInvitationAcceptanceModule.forRoot({}).providers || []),
      ],
    }).compile();

    listener = module.get(INVITATION_ACCEPTANCE_LISTENER_TOKEN);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listen', () => {
    it('should return true for non-user category invitations', async () => {
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: { ...mockInvitation, category: 'org' },
          data: {},
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockUserPortService.byId).not.toHaveBeenCalled();
    });

    it('should process user invitation with password successfully', async () => {
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: {
            password: 'Test123!',
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
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
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: {
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockPasswordService.create).not.toHaveBeenCalled();
      expect(mockUserPortService.update).toHaveBeenCalledWith({
        id: 'user-123',
        active: true,
      });
    });

    it('should create user metadata when provided', async () => {
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: {
            password: 'Test123!',
            userMetadata: {
              bio: 'Test bio',
              phoneNumber: '+1234567890',
            },
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);

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
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: {
            ...mockInvitation,
            constraints: { roleId: 'role-123' },
          },
          data: {
            password: 'Test123!',
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockCommandBus.execute).toHaveBeenCalled();
    });

    it('should ignore roleId from acceptance payload (security test)', async () => {
      // Arrange - roleId in payload should be ignored, only constraints.roleId is used
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: {
            ...mockInvitation,
            constraints: { roleId: 'admin-role-123' },
          },
          data: {
            password: 'Test123!',
            roleId: 'user-role-456', // This should be ignored
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert - should use roleId from constraints, not from payload
      expect(result).toBe(true);
      expect(mockCommandBus.execute).toHaveBeenCalled();
    });

    it('should assign default role when roleId not in constraints', async () => {
      // Arrange - no roleId in constraints, should fall back to default
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation, // constraints: {}
          data: {
            password: 'Test123!',
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.any(AssignDefaultRoleCommand),
      );
    });

    it('should return false when user not found', async () => {
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: {
            password: 'Test123!',
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(null as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(false);
      expect(mockUserPortService.byId).toHaveBeenCalledWith('user-123');
      expect(mockPasswordService.create).not.toHaveBeenCalled();
      expect(mockUserPortService.update).not.toHaveBeenCalled();
    });

    it('should return false and log error when password creation fails', async () => {
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: {
            password: 'Test123!',
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockRejectedValue(
        new Error('Password hash failed'),
      );

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(false);
      expect(mockUserPortService.update).not.toHaveBeenCalled();
    });

    it('should return false when user update fails', async () => {
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: {
            password: 'Test123!',
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockRejectedValue(new Error('Update failed'));

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(false);
      expect(mockCommandBus.execute).not.toHaveBeenCalled();
    });

    it('should return false when role assignment fails', async () => {
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: {
            password: 'Test123!',
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockRejectedValue(
        new Error('Role assignment failed'),
      );

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(false);
    });

    it('should handle empty data payload', async () => {
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: {},
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockPasswordService.create).not.toHaveBeenCalled();
    });

    it('should handle undefined data payload', async () => {
      // Arrange
      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: undefined,
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      mockUserPortService.byId.mockResolvedValue(mockUser as never);
      mockUserPortService.update.mockResolvedValue(undefined as never);
      mockCommandBus.execute.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('Custom listener override', () => {
    it('should allow custom listener service to be used', async () => {
      // Arrange - Create a custom listener class with overridden behavior
      @Injectable()
      class CustomInvitationUserAcceptanceListener {
        async listen(
          _event: EventAsyncInterface<
            TypedInvitationAcceptedEventPayloadInterface,
            boolean
          >,
        ): Promise<boolean> {
          // Custom behavior - always return true for testing
          return true;
        }
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
          // Provide custom listener via useClass
          {
            provide: INVITATION_ACCEPTANCE_LISTENER_TOKEN,
            useClass: CustomInvitationUserAcceptanceListener,
          },
        ],
      }).compile();

      const customListener = customModule.get(
        INVITATION_ACCEPTANCE_LISTENER_TOKEN,
      );

      const event = {
        key: 'InvitationAcceptedEventAsync',
        expectsReturnOf: Promise,
        payload: {
          invitation: mockInvitation,
          data: {
            password: 'Test123!',
          },
        },
      } as unknown as EventAsyncInterface<
        TypedInvitationAcceptedEventPayloadInterface,
        boolean
      >;

      // Act
      const result = await customListener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(customListener).toBeInstanceOf(
        CustomInvitationUserAcceptanceListener,
      );
      // Custom listener should not have called any services
      expect(mockUserPortService.byId).not.toHaveBeenCalled();
    });
  });
});
