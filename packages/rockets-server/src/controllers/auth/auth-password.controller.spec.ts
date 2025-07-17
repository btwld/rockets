import { Test, TestingModule } from '@nestjs/testing';
import { AuthPasswordController } from './auth-password.controller';
import { AuthLocalIssueTokenService } from '@concepta/nestjs-auth-local';
import { IssueTokenServiceInterface } from '@concepta/nestjs-authentication';
import { RocketsServerUserInterface } from '../../interfaces/common/rockets-server-user.interface';

describe(AuthPasswordController.name, () => {
  let controller: AuthPasswordController;
  let mockIssueTokenService: jest.Mocked<IssueTokenServiceInterface>;

  beforeEach(async () => {
    mockIssueTokenService = {
      responsePayload: jest.fn(),
      accessToken: jest.fn(),
      refreshToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthPasswordController],
      providers: [
        {
          provide: AuthLocalIssueTokenService,
          useValue: mockIssueTokenService,
        },
      ],
    }).compile();

    controller = module.get<AuthPasswordController>(AuthPasswordController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe(AuthPasswordController.prototype.login, () => {
    it('should return authentication response when user is provided', async () => {
      const mockUser: RocketsServerUserInterface = {
        id: 'user-123',
      };

      const mockResponse = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
      };

      mockIssueTokenService.responsePayload.mockResolvedValue(mockResponse);

      const result = await controller.login(mockUser);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'user-123',
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle service errors', async () => {
      const mockUser: RocketsServerUserInterface = {
        id: 'user-123',
      };

      const error = new Error('Token service error');
      mockIssueTokenService.responsePayload.mockRejectedValue(error);

      await expect(controller.login(mockUser)).rejects.toThrow(
        'Token service error',
      );

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'user-123',
      );
    });
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have login method', () => {
      expect(controller.login).toBeDefined();
      expect(typeof controller.login).toBe('function');
    });
  });
});
