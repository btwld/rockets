import { Test, TestingModule } from '@nestjs/testing';
import { AuthOAuthController } from './auth-oauth.controller';
import { IssueTokenService } from '@concepta/nestjs-authentication';
import { IssueTokenServiceInterface } from '@concepta/nestjs-authentication';
import { AuthenticatedUserInterface } from '@concepta/nestjs-common';
import { AuthRouterGuard } from '@concepta/nestjs-auth-router';

describe(AuthOAuthController.name, () => {
  let controller: AuthOAuthController;
  let mockIssueTokenService: jest.Mocked<IssueTokenServiceInterface>;

  beforeEach(async () => {
    mockIssueTokenService = {
      responsePayload: jest.fn(),
      accessToken: jest.fn(),
      refreshToken: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthOAuthController],
      providers: [
        {
          provide: IssueTokenService,
          useValue: mockIssueTokenService,
        },
      ],
    })
      .overrideGuard(AuthRouterGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get<AuthOAuthController>(AuthOAuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('authorize', () => {
    it('should return void for authorize endpoint', () => {
      const result = controller.authorize();
      expect(result).toBeUndefined();
    });
  });

  describe('callback', () => {
    it('should return authentication response when user is provided', async () => {
      const mockUser: AuthenticatedUserInterface = {
        id: 'user-123',
      };

      const mockResponse = {
        accessToken: 'oauth-access-token-123',
        refreshToken: 'oauth-refresh-token-123',
      };

      mockIssueTokenService.responsePayload.mockResolvedValue(mockResponse);

      const result = await controller.callback(mockUser);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'user-123',
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle service errors', async () => {
      const mockUser: AuthenticatedUserInterface = {
        id: 'user-123',
      };

      const error = new Error('Token service error');
      mockIssueTokenService.responsePayload.mockRejectedValue(error);

      await expect(controller.callback(mockUser)).rejects.toThrow(
        'Token service error',
      );

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'user-123',
      );
    });
  });

  describe('callbackPost', () => {
    it('should return authentication response when user is provided', async () => {
      const mockUser: AuthenticatedUserInterface = {
        id: 'user-456',
      };

      const mockResponse = {
        accessToken: 'post-oauth-access-token-456',
        refreshToken: 'post-oauth-refresh-token-456',
      };

      mockIssueTokenService.responsePayload.mockResolvedValue(mockResponse);

      const result = await controller.callbackPost(mockUser);

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'user-456',
      );
      expect(result).toEqual(mockResponse);
    });

    it('should handle service errors', async () => {
      const mockUser: AuthenticatedUserInterface = {
        id: 'user-456',
      };

      const error = new Error('Token service error');
      mockIssueTokenService.responsePayload.mockRejectedValue(error);

      await expect(controller.callbackPost(mockUser)).rejects.toThrow(
        'Token service error',
      );

      expect(mockIssueTokenService.responsePayload).toHaveBeenCalledWith(
        'user-456',
      );
    });

    it('should handle different user IDs', async () => {
      const mockUser: AuthenticatedUserInterface = {
        id: 'different-user-id',
      };

      const mockResponse = {
        accessToken: 'different-oauth-access-token',
        refreshToken: 'different-oauth-refresh-token',
      };

      mockIssueTokenService.responsePayload.mockResolvedValue(mockResponse);

      const result = await controller.callbackPost(mockUser);

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

    it('should have authorize method', () => {
      expect(controller.authorize).toBeDefined();
      expect(typeof controller.authorize).toBe('function');
    });

    it('should have callback method', () => {
      expect(controller.callback).toBeDefined();
      expect(typeof controller.callback).toBe('function');
    });

    it('should have callbackPost method', () => {
      expect(controller.callbackPost).toBeDefined();
      expect(typeof controller.callbackPost).toBe('function');
    });
  });
});
