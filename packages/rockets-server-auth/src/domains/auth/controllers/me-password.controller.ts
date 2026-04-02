import { AuthUser } from '@concepta/nestjs-authentication';
import { UpdateUserPasswordCommand } from '@concepta/nestjs-user';
import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
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
import { RocketsEntity } from '../../../shared/constants/repository-entity-keys.constants';
import { createRepositoryContext } from '../../../shared/utils/repository-context.helper';
import { logAndGetErrorDetails } from '../../../shared/utils/error-logging.helper';

@Controller('me')
@ApiTags('Me')
@ApiBearerAuth()
export class MePasswordController {
  private readonly logger = new Logger(MePasswordController.name);

  constructor(private readonly commandBus: CommandBus) {}

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
      const ctx = createRepositoryContext(RocketsEntity.user);
      await this.commandBus.execute(
        new UpdateUserPasswordCommand(ctx, user.id, {
          password: newPassword,
          passwordCurrent: currentPassword,
        }),
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
