import { Test, TestingModule } from '@nestjs/testing';
import { RocketsAuthNotificationService } from '../domains/otp/services/rockets-auth-notification.service';
import { RocketsAuthSettingsInterface } from '../shared/interfaces/rockets-auth-settings.interface';
import { EmailSendInterface } from '@concepta/nestjs-common';
import { EmailService } from '@concepta/nestjs-email';
import { ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN } from '../shared/constants/rockets-auth.constants';

describe(RocketsAuthNotificationService.name, () => {
  let service: RocketsAuthNotificationService;
  let mockEmailService: jest.Mocked<EmailSendInterface>;
  let mockSettings: RocketsAuthSettingsInterface;

  beforeEach(async () => {
    mockEmailService = {
      sendMail: jest.fn(),
    };

    mockSettings = {
      role: {
        adminRoleName: 'admin',
      },
      email: {
        from: 'noreply@example.com',
        baseUrl: 'https://example.com',
        templates: {
          sendOtp: {
            fileName: 'otp.template.hbs',
            subject: 'Your OTP Code',
          },
          invitation: {
            logo: '',
            fileName: 'invitation.template.hbs',
            subject: 'You have been invited',
          },
          invitationAccepted: {
            logo: '',
            fileName: 'invitation-accepted.template.hbs',
            subject: 'Invitation Accepted',
          },
        },
      },
      otp: {
        assignment: 'userOtp',
        category: 'login',
        type: 'uuid',
        expiresIn: '3600',
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RocketsAuthNotificationService,
        {
          provide: ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
          useValue: mockSettings,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<RocketsAuthNotificationService>(
      RocketsAuthNotificationService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe(RocketsAuthNotificationService.prototype.sendOtpEmail, () => {
    it('should send OTP email successfully', async () => {
      const params = {
        email: 'test@example.com',
        passcode: '123456',
      };

      await service.sendOtpEmail(params);

      expect(mockEmailService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        from: 'noreply@example.com',
        subject: 'Your OTP Code',
        template: 'otp.template.hbs',
        context: {
          passcode: '123456',
          tokenUrl: 'https://example.com/123456',
        },
      });
    });

    it('should handle different email and passcode values', async () => {
      const params = {
        email: 'user@test.com',
        passcode: 'ABC123',
      };

      await service.sendOtpEmail(params);

      expect(mockEmailService.sendMail).toHaveBeenCalledWith({
        to: 'user@test.com',
        from: 'noreply@example.com',
        subject: 'Your OTP Code',
        template: 'otp.template.hbs',
        context: {
          passcode: 'ABC123',
          tokenUrl: 'https://example.com/ABC123',
        },
      });
    });

    it('should use settings from configuration', async () => {
      const customSettings: RocketsAuthSettingsInterface = {
        role: {
          adminRoleName: 'admin',
        },
        email: {
          from: 'custom@example.com',
          baseUrl: 'https://custom.example.com',
          templates: {
            sendOtp: {
              fileName: 'custom-otp.template.hbs',
              subject: 'Custom OTP Subject',
            },
            invitation: {
              logo: '',
              fileName: 'invitation.template.hbs',
              subject: 'You have been invited',
            },
            invitationAccepted: {
              logo: '',
              fileName: 'invitation-accepted.template.hbs',
              subject: 'Invitation Accepted',
            },
          },
        },
        otp: {
          assignment: 'userOtp' as const,
          category: 'login',
          type: 'uuid',
          expiresIn: '3600',
        },
      };

      const customModule: TestingModule = await Test.createTestingModule({
        providers: [
          RocketsAuthNotificationService,
          {
            provide: ROCKETS_AUTH_MODULE_OPTIONS_DEFAULT_SETTINGS_TOKEN,
            useValue: customSettings,
          },
          {
            provide: EmailService,
            useValue: mockEmailService,
          },
        ],
      }).compile();

      const customService = customModule.get<RocketsAuthNotificationService>(
        RocketsAuthNotificationService,
      );

      const params = {
        email: 'test@example.com',
        passcode: '123456',
      };

      await customService.sendOtpEmail(params);

      expect(mockEmailService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        from: 'custom@example.com',
        subject: 'Custom OTP Subject',
        template: 'custom-otp.template.hbs',
        context: {
          passcode: '123456',
          tokenUrl: 'https://custom.example.com/123456',
        },
      });
    });

    it('should handle email service errors', async () => {
      const params = {
        email: 'test@example.com',
        passcode: '123456',
      };

      const error = new Error('Email service error');
      mockEmailService.sendMail.mockRejectedValue(error);

      await expect(service.sendOtpEmail(params)).rejects.toThrow(
        'Email service error',
      );

      expect(mockEmailService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        from: 'noreply@example.com',
        subject: 'Your OTP Code',
        template: 'otp.template.hbs',
        context: {
          passcode: '123456',
          tokenUrl: 'https://example.com/123456',
        },
      });
    });

    it('should handle empty passcode', async () => {
      const params = {
        email: 'test@example.com',
        passcode: '',
      };

      await service.sendOtpEmail(params);

      expect(mockEmailService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        from: 'noreply@example.com',
        subject: 'Your OTP Code',
        template: 'otp.template.hbs',
        context: {
          passcode: '',
          tokenUrl: 'https://example.com/',
        },
      });
    });

    it('should handle special characters in passcode', async () => {
      const params = {
        email: 'test@example.com',
        passcode: 'ABC-123_456',
      };

      await service.sendOtpEmail(params);

      expect(mockEmailService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        from: 'noreply@example.com',
        subject: 'Your OTP Code',
        template: 'otp.template.hbs',
        context: {
          passcode: 'ABC-123_456',
          tokenUrl: 'https://example.com/ABC-123_456',
        },
      });
    });
  });

  describe('service instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should implement RocketsAuthOtpNotificationServiceInterface', () => {
      expect(service).toHaveProperty('sendOtpEmail');
      expect(typeof service.sendOtpEmail).toBe('function');
    });
  });
});
