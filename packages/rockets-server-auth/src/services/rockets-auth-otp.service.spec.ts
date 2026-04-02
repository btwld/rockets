import { Test, TestingModule } from '@nestjs/testing';
import { OtpException } from '@concepta/nestjs-otp';
import { RocketsAuthOtpService } from '../domains/otp/services/rockets-auth-otp.service';
import { RocketsAuthUserModelServiceInterface } from '../shared/interfaces/rockets-auth-user-model-service.interface';
import { RocketsAuthOtpNotificationServiceInterface } from '../domains/otp/interfaces/rockets-auth-otp-notification-service.interface';
import { RocketsAuthSettingsInterface } from '../shared/interfaces/rockets-auth-settings.interface';
import { RocketsAuthNotificationService } from '../domains/otp/services/rockets-auth-notification.service';
import {
  ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
  ROCKETS_AUTH_OTP_ASSIGNMENT,
  RocketsAuthUserModelService,
} from '../shared/constants/rockets-auth.constants';
import { ROCKETS_AUTH_OTP_PORT_TOKEN } from '../shared/ports/rockets-auth-otp-port.service';

describe(RocketsAuthOtpService.name, () => {
  let service: RocketsAuthOtpService;
  let mockUserModelService: jest.Mocked<RocketsAuthUserModelServiceInterface>;
  let mockOtpService: { create: jest.Mock; validate: jest.Mock };
  let mockOtpNotificationService: jest.Mocked<RocketsAuthOtpNotificationServiceInterface>;
  let mockSettings: RocketsAuthSettingsInterface;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    username: 'testuser',
    passwordHash: 'hashed-password',
    passwordSalt: 'salt',
    active: true,
    dateCreated: new Date(),
    dateUpdated: new Date(),
    dateDeleted: null,
    version: 1,
  };

  const mockOtpResult = {
    passcode: '123456',
    id: 'otp-123',
    category: 'login',
    type: 'uuid',
    expirationDate: new Date(),
    active: true,
    assigneeId: 'user-123',
    assignee: mockUser,
    dateCreated: new Date(),
    dateUpdated: new Date(),
    dateDeleted: null,
    version: 1,
  };

  beforeEach(async () => {
    // Create mocks
    mockUserModelService = {
      byEmail: jest.fn(),
      bySubject: jest.fn(),
      byUsername: jest.fn(),
      byId: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
    };

    mockOtpService = {
      create: jest.fn(),
      validate: jest.fn(),
    };

    mockOtpNotificationService = {
      sendOtpEmail: jest.fn(),
    };

    mockSettings = {
      role: { adminRoleName: 'admin' },
      email: {
        from: 'noreply@example.com',
        baseUrl: 'https://example.com',
        templates: {
          sendOtp: {
            fileName: 'otp.template.hbs',
            subject: 'Your OTP Code',
          },
          invitation: {
            logo: 'logo.png',
            fileName: 'invitation.template.hbs',
            subject: 'You have been invited',
          },
          invitationAccepted: {
            logo: 'logo.png',
            fileName: 'invitation-accepted.template.hbs',
            subject: 'Invitation Accepted',
          },
        },
      },
      otp: {
        assignment: ROCKETS_AUTH_OTP_ASSIGNMENT,
        category: 'login',
        type: 'uuid',
        expiresIn: '3600', // 1 hour as string
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RocketsAuthOtpService,
        {
          provide: ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
          useValue: mockSettings,
        },
        {
          provide: RocketsAuthUserModelService,
          useValue: mockUserModelService,
        },
        {
          provide: ROCKETS_AUTH_OTP_PORT_TOKEN,
          useValue: mockOtpService,
        },
        {
          provide: RocketsAuthNotificationService,
          useValue: mockOtpNotificationService,
        },
      ],
    }).compile();

    service = module.get<RocketsAuthOtpService>(RocketsAuthOtpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe(RocketsAuthOtpService.prototype.sendOtp, () => {
    it('should send OTP when user exists', async () => {
      // Arrange
      const email = 'test@example.com';
      mockUserModelService.byEmail.mockResolvedValue(mockUser);
      mockOtpService.create.mockResolvedValue(mockOtpResult);
      mockOtpNotificationService.sendOtpEmail.mockResolvedValue(undefined);

      // Act
      await service.sendOtp(email);

      // Assert
      expect(mockUserModelService.byEmail).toHaveBeenCalledWith(email);
      expect(mockOtpService.create).toHaveBeenCalledWith({
        assignment: mockSettings.otp.assignment,
        otp: {
          category: mockSettings.otp.category,
          type: 'uuid',
          assigneeId: mockUser.id,
          expiresIn: mockSettings.otp.expiresIn,
        },
      });
      expect(mockOtpNotificationService.sendOtpEmail).toHaveBeenCalledWith({
        email,
        passcode: mockOtpResult.passcode,
      });
    });

    it('should not send OTP when user does not exist', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      mockUserModelService.byEmail.mockResolvedValue(null);

      // Act
      await service.sendOtp(email);

      // Assert
      expect(mockUserModelService.byEmail).toHaveBeenCalledWith(email);
      expect(mockOtpService.create).not.toHaveBeenCalled();
      expect(mockOtpNotificationService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('should throw error when notification service fails', async () => {
      // Arrange
      const email = 'test@example.com';
      mockUserModelService.byEmail.mockResolvedValue(mockUser);
      mockOtpService.create.mockResolvedValue(mockOtpResult);
      mockOtpNotificationService.sendOtpEmail.mockRejectedValue(
        new Error('Email service error'),
      );

      // Act & Assert
      await expect(service.sendOtp(email)).rejects.toThrow();
    });

    it('should throw error when OTP service fails', async () => {
      // Arrange
      const email = 'test@example.com';
      mockUserModelService.byEmail.mockResolvedValue(mockUser);
      mockOtpService.create.mockRejectedValue(new Error('OTP service error'));

      // Act & Assert
      await expect(service.sendOtp(email)).rejects.toThrow();
    });
  });

  describe(RocketsAuthOtpService.prototype.confirmOtp, () => {
    it('should confirm OTP successfully when user exists and OTP is valid', async () => {
      // Arrange
      const email = 'test@example.com';
      const passcode = '123456';
      mockUserModelService.byEmail.mockResolvedValue(mockUser);
      mockOtpService.validate.mockResolvedValue(mockUser);

      // Act
      const result = await service.confirmOtp(email, passcode);

      // Assert
      expect(mockUserModelService.byEmail).toHaveBeenCalledWith(email);
      expect(mockOtpService.validate).toHaveBeenCalledWith(
        mockSettings.otp.assignment,
        {
          category: mockSettings.otp.category,
          passcode,
        },
        true,
      );
      expect(result).toEqual(mockUser);
    });

    it('should throw OtpException when user does not exist', async () => {
      // Arrange
      const email = 'nonexistent@example.com';
      const passcode = '123456';
      mockUserModelService.byEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(service.confirmOtp(email, passcode)).rejects.toThrow(
        OtpException,
      );
      expect(mockUserModelService.byEmail).toHaveBeenCalledWith(email);
      expect(mockOtpService.validate).not.toHaveBeenCalled();
    });

    it('should throw OtpException when OTP is invalid', async () => {
      // Arrange
      const email = 'test@example.com';
      const passcode = 'invalid-passcode';
      mockUserModelService.byEmail.mockResolvedValue(mockUser);
      mockOtpService.validate.mockResolvedValue(null);

      // Act & Assert
      await expect(service.confirmOtp(email, passcode)).rejects.toThrow(
        OtpException,
      );
      expect(mockUserModelService.byEmail).toHaveBeenCalledWith(email);
      expect(mockOtpService.validate).toHaveBeenCalledWith(
        mockSettings.otp.assignment,
        {
          category: mockSettings.otp.category,
          passcode,
        },
        true,
      );
    });

    it('should throw OtpException when OTP service throws error', async () => {
      // Arrange
      const email = 'test@example.com';
      const passcode = '123456';
      mockUserModelService.byEmail.mockResolvedValue(mockUser);
      mockOtpService.validate.mockRejectedValue(
        new Error('OTP validation error'),
      );

      // Act & Assert
      await expect(service.confirmOtp(email, passcode)).rejects.toThrow(
        'OTP validation error',
      );
      expect(mockUserModelService.byEmail).toHaveBeenCalledWith(email);
      expect(mockOtpService.validate).toHaveBeenCalledWith(
        mockSettings.otp.assignment,
        {
          category: mockSettings.otp.category,
          passcode,
        },
        true,
      );
    });

    it('should throw OtpException when user lookup service throws error', async () => {
      // Arrange
      const email = 'test@example.com';
      const passcode = '123456';
      mockUserModelService.byEmail.mockRejectedValue(
        new Error('User lookup error'),
      );

      // Act & Assert
      await expect(service.confirmOtp(email, passcode)).rejects.toThrow(
        'User lookup error',
      );
      expect(mockUserModelService.byEmail).toHaveBeenCalledWith(email);
      expect(mockOtpService.validate).not.toHaveBeenCalled();
    });
  });

  describe('constructor', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have all required dependencies injected', () => {
      expect(service).toBeInstanceOf(RocketsAuthOtpService);
    });
  });
});
