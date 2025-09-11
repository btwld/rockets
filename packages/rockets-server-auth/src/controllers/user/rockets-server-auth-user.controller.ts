import { UserModelService } from '@concepta/nestjs-user';
import { AuthUser } from '@concepta/nestjs-authentication';
import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiResponse,
} from '@nestjs/swagger';
import { RocketsServerAuthUserUpdateDto } from '../../dto/user/rockets-server-auth-user-update.dto';
import { RocketsServerAuthUserDto } from '../../dto/user/rockets-server-auth-user.dto';
import { RocketsServerAuthUserEntityInterface } from '../../interfaces/user/rockets-server-auth-user-entity.interface';
import { AuthJwtGuard } from '@concepta/nestjs-auth-jwt';

/**
 * Controller for managing user profile operations
 */
@Controller('user')
@UseGuards(AuthJwtGuard)
@ApiTags('user')
@ApiBearerAuth()
export class RocketsServerAuthUserController {
  constructor(
    @Inject(UserModelService)
    private readonly userModelService: UserModelService,
  ) {}

  @ApiOperation({
    summary: 'Get a user by ID',
    description:
      "Retrieves the currently authenticated user's profile information",
  })
  @ApiOkResponse({
    description: 'User profile retrieved successfully',
    type: RocketsServerAuthUserDto,
  })
  @ApiNotFoundResponse({
    description: 'User not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User not authenticated',
  })
  @Get('')
  async findById(
    @AuthUser('id') id: string,
  ): Promise<RocketsServerAuthUserEntityInterface | null> {
    return this.userModelService.byId(id);
  }

  @ApiOperation({
    summary: 'Update a user',
    description:
      "Updates the currently authenticated user's profile information",
  })
  @ApiBody({
    type: RocketsServerAuthUserUpdateDto,
    description: 'User profile information to update',
    examples: {
      user: {
        value: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
        },
        summary: 'Standard user update',
      },
    },
  })
  @ApiOkResponse({
    description: 'User updated successfully',
    type: RocketsServerAuthUserDto,
  })
  @ApiBadRequestResponse({
    description: 'Bad request - Invalid input data',
  })
  @ApiNotFoundResponse({
    description: 'User not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - User not authenticated',
  })
  @Patch('')
  async update(
    @AuthUser('id') id: string,
    @Body() userUpdateDto: RocketsServerAuthUserUpdateDto,
  ): Promise<RocketsServerAuthUserEntityInterface> {
    return this.userModelService.update({ ...userUpdateDto, id });
  }
}
