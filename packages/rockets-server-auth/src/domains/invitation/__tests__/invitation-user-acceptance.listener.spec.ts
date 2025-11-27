import { Test, TestingModule } from '@nestjs/testing';
import { InvitationUserAcceptanceListener } from '../services/invitation-user-acceptance.listener';
import { UserModelService } from '@concepta/nestjs-user';
import { PasswordCreationService } from '@concepta/nestjs-password';
import { RoleService } from '@concepta/nestjs-role';
import { GenericUserMetadataModelService } from '../../user/services/rockets-auth-user-metadata.model.service';
import { RocketsAuthRoleService } from '../../role/services/rockets-auth-role.service';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../../../shared/constants/rockets-auth.constants';
import { UserMetadataModelService } from '../../user/constants/user-metadata.constants';
import { EventAsyncInterface } from '@concepta/nestjs-event';
import { TypedInvitationAcceptedEventPayloadInterface } from '../interfaces/invitation-acceptance-data.interface';
import { InvitationInterface } from '@concepta/nestjs-common';

describe(InvitationUserAcceptanceListener.name, () => {
  let listener: InvitationUserAcceptanceListener;
  let mockUserModelService: jest.Mocked<UserModelService>;
  let mockPasswordService: jest.Mocked<PasswordCreationService>;
  let mockUserMetadataService: jest.Mocked<GenericUserMetadataModelService>;
  let mockRoleService: jest.Mocked<RoleService>;
  let mockAuthRoleService: jest.Mocked<RocketsAuthRoleService>;

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
    version: 1,
  };

  const mockSettings = {
    role: {
      adminRoleName: 'admin',
      defaultUserRoleName: 'user',
    },
    email: {
      from: 'noreply@example.com',
      baseUrl: 'http://localhost:3000',
      templates: {},
    },
    otp: {
      assignment: 'userOtp',
      category: 'auth-login',
      type: 'uuid',
      expiresIn: '1h',
    },
  };

  beforeEach(async () => {
    mockUserModelService = {
      byId: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<UserModelService>;

    mockPasswordService = {
      create: jest.fn(),
    } as unknown as jest.Mocked<PasswordCreationService>;

    mockUserMetadataService = {
      createOrUpdate: jest.fn(),
    } as unknown as jest.Mocked<GenericUserMetadataModelService>;

    mockRoleService = {
      assignRole: jest.fn(),
    } as unknown as jest.Mocked<RoleService>;

    mockAuthRoleService = {
      assignDefaultRoleToUser: jest.fn(),
    } as unknown as jest.Mocked<RocketsAuthRoleService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvitationUserAcceptanceListener,
        {
          provide: UserModelService,
          useValue: mockUserModelService,
        },
        {
          provide: PasswordCreationService,
          useValue: mockPasswordService,
        },
        {
          provide: UserMetadataModelService,
          useValue: mockUserMetadataService,
        },
        {
          provide: RoleService,
          useValue: mockRoleService,
        },
        {
          provide: RocketsAuthRoleService,
          useValue: mockAuthRoleService,
        },
        {
          provide: ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
          useValue: mockSettings,
        },
      ],
    }).compile();

    listener = module.get<InvitationUserAcceptanceListener>(
      InvitationUserAcceptanceListener,
    );
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
      expect(mockUserModelService.byId).not.toHaveBeenCalled();
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserModelService.update.mockResolvedValue(undefined as never);
      mockAuthRoleService.assignDefaultRoleToUser.mockResolvedValue(
        undefined as never,
      );

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockUserModelService.byId).toHaveBeenCalledWith('user-123');
      expect(mockPasswordService.create).toHaveBeenCalledWith('Test123!');
      expect(mockUserModelService.update).toHaveBeenCalledWith({
        id: 'user-123',
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      });
      expect(mockAuthRoleService.assignDefaultRoleToUser).toHaveBeenCalledWith(
        'user-123',
        true,
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockUserModelService.update.mockResolvedValue(undefined as never);
      mockAuthRoleService.assignDefaultRoleToUser.mockResolvedValue(
        undefined as never,
      );

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockPasswordService.create).not.toHaveBeenCalled();
      expect(mockUserModelService.update).toHaveBeenCalledWith({
        id: 'user-123',
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserModelService.update.mockResolvedValue(undefined as never);
      mockUserMetadataService.createOrUpdate.mockResolvedValue(
        undefined as never,
      );
      mockAuthRoleService.assignDefaultRoleToUser.mockResolvedValue(
        undefined as never,
      );

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockUserMetadataService.createOrUpdate).toHaveBeenCalledWith(
        'user-123',
        {
          bio: 'Test bio',
          phoneNumber: '+1234567890',
        },
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserModelService.update.mockResolvedValue(undefined as never);
      mockRoleService.assignRole.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockRoleService.assignRole).toHaveBeenCalledWith({
        assignment: 'user',
        assignee: { id: 'user-123' },
        role: { id: 'role-123' },
      });
      expect(
        mockAuthRoleService.assignDefaultRoleToUser,
      ).not.toHaveBeenCalled();
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserModelService.update.mockResolvedValue(undefined as never);
      mockRoleService.assignRole.mockResolvedValue(undefined as never);

      // Act
      const result = await listener.listen(event);

      // Assert - should use roleId from constraints, not from payload
      expect(result).toBe(true);
      expect(mockRoleService.assignRole).toHaveBeenCalledWith({
        assignment: 'user',
        assignee: { id: 'user-123' },
        role: { id: 'admin-role-123' }, // From constraints, not payload
      });
      expect(
        mockAuthRoleService.assignDefaultRoleToUser,
      ).not.toHaveBeenCalled();
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserModelService.update.mockResolvedValue(undefined as never);
      mockAuthRoleService.assignDefaultRoleToUser.mockResolvedValue(
        undefined as never,
      );

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockAuthRoleService.assignDefaultRoleToUser).toHaveBeenCalledWith(
        'user-123',
        true,
      );
      expect(mockRoleService.assignRole).not.toHaveBeenCalled();
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

      mockUserModelService.byId.mockResolvedValue(null as never);

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(false);
      expect(mockUserModelService.byId).toHaveBeenCalledWith('user-123');
      expect(mockPasswordService.create).not.toHaveBeenCalled();
      expect(mockUserModelService.update).not.toHaveBeenCalled();
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockRejectedValue(
        new Error('Password hash failed'),
      );

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(false);
      expect(mockUserModelService.update).not.toHaveBeenCalled();
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserModelService.update.mockRejectedValue(new Error('Update failed'));

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(false);
      expect(
        mockAuthRoleService.assignDefaultRoleToUser,
      ).not.toHaveBeenCalled();
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockPasswordService.create.mockResolvedValue({
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      } as never);
      mockUserModelService.update.mockResolvedValue(undefined as never);
      mockAuthRoleService.assignDefaultRoleToUser.mockRejectedValue(
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockUserModelService.update.mockResolvedValue(undefined as never);
      mockAuthRoleService.assignDefaultRoleToUser.mockResolvedValue(
        undefined as never,
      );

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
      expect(mockPasswordService.create).not.toHaveBeenCalled();
      expect(mockUserMetadataService.createOrUpdate).not.toHaveBeenCalled();
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

      mockUserModelService.byId.mockResolvedValue(mockUser as never);
      mockUserModelService.update.mockResolvedValue(undefined as never);
      mockAuthRoleService.assignDefaultRoleToUser.mockResolvedValue(
        undefined as never,
      );

      // Act
      const result = await listener.listen(event);

      // Assert
      expect(result).toBe(true);
    });
  });
});
