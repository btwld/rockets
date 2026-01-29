import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { MePasswordController } from './me-password.controller';
import { PasswordValidationService } from '@concepta/nestjs-password';
import { UserPasswordService } from '@concepta/nestjs-user';
import { RocketsAuthUserInterface } from '../../user/interfaces/rockets-auth-user.interface';
import { RocketsAuthChangePasswordDto } from '../dto/rockets-auth-change-password.dto';

describe(MePasswordController.name, () => {
  let controller: MePasswordController;
  let mockUserPasswordService: jest.Mocked<UserPasswordService>;
  let mockPasswordValidationService: jest.Mocked<PasswordValidationService>;

  const defaultMockUser: RocketsAuthUserInterface = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    active: true,
    dateCreated: new Date(),
    dateUpdated: new Date(),
    dateDeleted: null,
    version: 2,
    userMetadata: {},
  };

  const mockPasswordStore = {
    id: 'user-123',
    passwordHash: 'hashed-password',
    passwordSalt: 'salt',
  };

  beforeEach(async () => {
    mockUserPasswordService = {
      getPasswordStore: jest.fn(),
      setPassword: jest.fn(),
    } as unknown as jest.Mocked<UserPasswordService>;

    mockPasswordValidationService = {
      validate: jest.fn(),
    } as unknown as jest.Mocked<PasswordValidationService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MePasswordController],
      providers: [
        {
          provide: UserPasswordService,
          useValue: mockUserPasswordService,
        },
        {
          provide: PasswordValidationService,
          useValue: mockPasswordValidationService,
        },
      ],
    }).compile();

    controller = module.get<MePasswordController>(MePasswordController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have changePassword method', () => {
      expect(controller.changePassword).toBeDefined();
      expect(typeof controller.changePassword).toBe('function');
    });
  });

  describe(MePasswordController.prototype.changePassword.name, () => {
    const changePasswordDto: RocketsAuthChangePasswordDto = {
      currentPassword: 'CurrentP@ssw0rd',
      newPassword: 'NewSecureP@ssw0rd',
    };

    it('should successfully change password when current password is valid', async () => {
      mockUserPasswordService.getPasswordStore.mockResolvedValue(
        mockPasswordStore,
      );
      mockPasswordValidationService.validate.mockResolvedValue(true);
      mockUserPasswordService.setPassword.mockResolvedValue();

      await expect(
        controller.changePassword(defaultMockUser, changePasswordDto),
      ).resolves.toBeUndefined();

      expect(mockUserPasswordService.getPasswordStore).toHaveBeenCalledWith(
        'user-123',
      );
      expect(mockPasswordValidationService.validate).toHaveBeenCalledWith({
        password: 'CurrentP@ssw0rd',
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      });
      expect(mockUserPasswordService.setPassword).toHaveBeenCalledWith(
        {
          password: 'NewSecureP@ssw0rd',
          passwordCurrent: 'CurrentP@ssw0rd',
        },
        'user-123',
        defaultMockUser,
      );
    });

    it('should throw UnauthorizedException when current password is invalid', async () => {
      mockUserPasswordService.getPasswordStore.mockResolvedValue(
        mockPasswordStore,
      );
      mockPasswordValidationService.validate.mockResolvedValue(false);

      await expect(
        controller.changePassword(defaultMockUser, changePasswordDto),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockUserPasswordService.getPasswordStore).toHaveBeenCalledWith(
        'user-123',
      );
      expect(mockPasswordValidationService.validate).toHaveBeenCalledWith({
        password: 'CurrentP@ssw0rd',
        passwordHash: 'hashed-password',
        passwordSalt: 'salt',
      });
      expect(mockUserPasswordService.setPassword).not.toHaveBeenCalled();
    });

    it('should throw error when getPasswordStore fails', async () => {
      const error = new Error('Database error');
      mockUserPasswordService.getPasswordStore.mockRejectedValue(error);

      await expect(
        controller.changePassword(defaultMockUser, changePasswordDto),
      ).rejects.toThrow('Database error');

      expect(mockUserPasswordService.getPasswordStore).toHaveBeenCalledWith(
        'user-123',
      );
      expect(mockPasswordValidationService.validate).not.toHaveBeenCalled();
      expect(mockUserPasswordService.setPassword).not.toHaveBeenCalled();
    });

    it('should throw error when setPassword fails', async () => {
      mockUserPasswordService.getPasswordStore.mockResolvedValue(
        mockPasswordStore,
      );
      mockPasswordValidationService.validate.mockResolvedValue(true);
      const error = new Error('Password update failed');
      mockUserPasswordService.setPassword.mockRejectedValue(error);

      await expect(
        controller.changePassword(defaultMockUser, changePasswordDto),
      ).rejects.toThrow('Password update failed');

      expect(mockUserPasswordService.getPasswordStore).toHaveBeenCalled();
      expect(mockPasswordValidationService.validate).toHaveBeenCalled();
      expect(mockUserPasswordService.setPassword).toHaveBeenCalled();
    });

    it('should handle user with empty passwordSalt', async () => {
      const passwordStoreWithEmptySalt = {
        id: 'user-123',
        passwordHash: 'hashed-password',
        passwordSalt: '',
      };

      mockUserPasswordService.getPasswordStore.mockResolvedValue(
        passwordStoreWithEmptySalt,
      );
      mockPasswordValidationService.validate.mockResolvedValue(true);
      mockUserPasswordService.setPassword.mockResolvedValue();

      await expect(
        controller.changePassword(defaultMockUser, changePasswordDto),
      ).resolves.toBeUndefined();

      expect(mockPasswordValidationService.validate).toHaveBeenCalledWith({
        password: 'CurrentP@ssw0rd',
        passwordHash: 'hashed-password',
        passwordSalt: '',
      });
    });
  });
});
