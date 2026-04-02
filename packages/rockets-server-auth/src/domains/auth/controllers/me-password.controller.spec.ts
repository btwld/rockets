import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { UpdateUserPasswordCommand } from '@concepta/nestjs-user';
import { MePasswordController } from './me-password.controller';
import { RocketsAuthUserInterface } from '../../user/interfaces/rockets-auth-user.interface';
import { RocketsAuthChangePasswordDto } from '../dto/rockets-auth-change-password.dto';

describe(MePasswordController.name, () => {
  let controller: MePasswordController;
  let mockCommandBus: jest.Mocked<Pick<CommandBus, 'execute'>>;

  const defaultMockUser: RocketsAuthUserInterface = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    active: true,
    userMetadata: {},
  };

  beforeEach(async () => {
    mockCommandBus = {
      execute: jest.fn(),
    } as jest.Mocked<Pick<CommandBus, 'execute'>>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MePasswordController],
      providers: [
        {
          provide: CommandBus,
          useValue: mockCommandBus,
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
      mockCommandBus.execute.mockResolvedValue(undefined);

      await expect(
        controller.changePassword(defaultMockUser, changePasswordDto),
      ).resolves.toBeUndefined();

      expect(mockCommandBus.execute).toHaveBeenCalledTimes(1);
      expect(mockCommandBus.execute).toHaveBeenCalledWith(
        expect.any(UpdateUserPasswordCommand),
      );

      const dispatched = mockCommandBus.execute.mock.calls[0][0] as {
        userId: string;
        passwordDto: { password: string; passwordCurrent: string };
      };
      expect(dispatched.userId).toBe('user-123');
      expect(dispatched.passwordDto).toEqual({
        password: 'NewSecureP@ssw0rd',
        passwordCurrent: 'CurrentP@ssw0rd',
      });
    });

    it('should throw UnauthorizedException when command bus throws it', async () => {
      mockCommandBus.execute.mockRejectedValue(
        new UnauthorizedException('Invalid current password'),
      );

      await expect(
        controller.changePassword(defaultMockUser, changePasswordDto),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockCommandBus.execute).toHaveBeenCalledTimes(1);
    });

    it('should throw error when command bus fails', async () => {
      const error = new Error('Database error');
      mockCommandBus.execute.mockRejectedValue(error);

      await expect(
        controller.changePassword(defaultMockUser, changePasswordDto),
      ).rejects.toThrow('Database error');

      expect(mockCommandBus.execute).toHaveBeenCalledTimes(1);
    });
  });
});
