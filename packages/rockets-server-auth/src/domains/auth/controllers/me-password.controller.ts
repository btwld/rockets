import { AuthUser } from '@concepta/nestjs-authentication';
import { PasswordValidationService } from '@concepta/nestjs-password';
import { UserPasswordService } from '@concepta/nestjs-user';
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Logger,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RocketsAuthChangePasswordDto } from '../dto/rockets-auth-change-password.dto';
import { RocketsAuthUserInterface } from '../../user/interfaces/rockets-auth-user.interface';
import { logAndGetErrorDetails } from '../../../shared/utils/error-logging.helper';

/**
 * Controller for authenticated password change
 *
 * Allows authenticated users to change their own password by
 * providing their current password for verification.
 */
@Controller('me')
@ApiTags('Me')
@ApiBearerAuth()
export class MePasswordController {
  private readonly logger = new Logger(MePasswordController.name);

  constructor(
    @Inject(UserPasswordService)
    private readonly userPasswordService: UserPasswordService,
    @Inject(PasswordValidationService)
    private readonly passwordValidationService: PasswordValidationService,
  ) {}

  @Patch('password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Change password',
    description:
      'Allows authenticated user to change their own password by providing current and new password',
    operationId: 'changeMyPassword',
  })
  @ApiBody({
    type: RocketsAuthChangePasswordDto,
    description: 'Current and new password',
    examples: {
      standard: {
        value: {
          currentPassword: 'CurrentP@ssw0rd',
          newPassword: 'NewSecureP@ssw0rd',
        },
        summary: 'Standard password change',
      },
    },
  })
  @ApiOkResponse({
    description: 'Password changed successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid current password or authentication token',
  })
  @ApiBadRequestResponse({
    description: 'New password does not meet requirements',
  })
  async changePassword(
    @AuthUser() user: RocketsAuthUserInterface,
    @Body() changePasswordDto: RocketsAuthChangePasswordDto,
  ): Promise<void> {
    const { currentPassword, newPassword } = changePasswordDto;

    try {
      // Get the stored password hash for the user
      const passwordStore = await this.userPasswordService.getPasswordStore(
        user.id,
      );

      // Validate the current password
      const isValid = await this.passwordValidationService.validate({
        password: currentPassword,
        passwordHash: passwordStore.passwordHash,
        passwordSalt: passwordStore.passwordSalt,
      });

      if (!isValid) {
        throw new UnauthorizedException('Invalid current password');
      }

      // Update to the new password
      await this.userPasswordService.setPassword(
        {
          password: newPassword,
          passwordCurrent: currentPassword,
        },
        user.id,
        user,
      );

      this.logger.log('Password changed successfully', { userId: user.id });
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      logAndGetErrorDetails(error, this.logger, 'Failed to change password', {
        userId: user.id,
        errorId: 'PASSWORD_CHANGE_FAILED',
      });

      throw error;
    }
  }
}
