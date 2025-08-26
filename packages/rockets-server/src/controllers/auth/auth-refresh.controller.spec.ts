import { Test, TestingModule } from '@nestjs/testing';
import { AuthTokenRefreshController } from './auth-refresh.controller';
import { AuthRefreshIssueTokenService } from '@concepta/nestjs-auth-refresh';
import { IssueTokenServiceInterface } from '@concepta/nestjs-authentication';
import { RocketsServerUserInterface } from '../../interfaces/user/rockets-server-user.interface';

describe(AuthTokenRefreshController.name, () => {
  let controller: AuthTokenRefreshController;
  let mockIssueTokenService: jest.Mocked<IssueTokenServiceInterface>;
  const defaultMockUser = {
    username: 'testuser',
    email: 'test@example.com',
    active: true,
    dateCreated: new Date(),
    dateUpdated: new Date(),
    dateDeleted: null,
    version: 2,
  };
  beforeEach(async () => {
    mockIssueTokenService = {
      responsePayload: jest.fn(),
      accessToken: jest.fn(),
      refreshToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthTokenRefreshController],
      providers: [
        {
          provide: AuthRefreshIssueTokenService,
          useValue: mockIssueTokenService,
        },
      ],
    }).compile();

    controller = module.get<AuthTokenRefreshController>(
      AuthTokenRefreshController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe(AuthTokenRefreshController.prototype.refresh, () => {
    it('should return authentication response when user is provided', async () => {
      const mockUser: RocketsServerUserInterface = {
        id: 'user-123',
        ...defaultMockUser,
      };

      const mockResponse = {
        accessToken: 'new-access-token-123',
        refreshToken: 'new-refresh-token-123',
      };

      mockIssueTokenService.responsePayload.mockResolvedValue(mockResponse);

      const result = await controller.refresh(mockUser);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'user-123',
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle service errors', async () => {
      const mockUser: RocketsServerUserInterface = {
        id: 'user-123',
        ...defaultMockUser,
      };

      const error = new Error('Token service error');
      mockIssueTokenService.responsePayload.mockRejectedValue(error);

      await expect(controller.refresh(mockUser)).rejects.toThrow(
        'Token service error',
      );

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'user-123',
      );
    });

    it('should handle different user IDs', async () => {
      const mockUser: RocketsServerUserInterface = {
        id: 'different-user-id',
        ...defaultMockUser,
      };

      const mockResponse = {
        accessToken: 'different-access-token',
        refreshToken: 'different-refresh-token',
      };

      mockIssueTokenService.responsePayload.mockResolvedValue(mockResponse);

      const result = await controller.refresh(mockUser);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'different-user-id',
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('controller instantiation', () => {
    it('should be defined', () => {
      expect(controller).toBeDefined();
    });

    it('should have refresh method', () => {
      expect(controller.refresh).toBeDefined();
      expect(typeof controller.refresh).toBe('function');
    });
  });
});
