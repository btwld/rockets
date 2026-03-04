import { Controller, Get, Patch, Body, Inject } from '@nestjs/common';
import { AuthUser } from '@concepta/nestjs-authentication';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { AuthorizedUser } from '../../interfaces/auth-user.interface';
import { UserMetadataModelServiceInterface } from '../user-metadata/interfaces/user-metadata.interface';
import { UserUpdateDto, UserResponseDto } from './user.dto';
import { UserMetadataModelService } from '../user-metadata/constants/user-metadata.constants';

@ApiTags('user')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    @Inject(UserMetadataModelService)
    private readonly userMetadataModelService: UserMetadataModelServiceInterface,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get current user information',
    description: 'Returns authenticated user data along with userMetadata data',
  })
  @ApiResponse({
    status: 200,
    description: 'User information retrieved successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async me(@AuthUser() user: AuthorizedUser): Promise<UserResponseDto> {
    const userMetadata =
      await this.userMetadataModelService.getUserMetadataByUserId(user.id);

    return {
      ...user,
      userMetadata: userMetadata ? { ...userMetadata } : {},
    };
  }

  @Patch()
  @ApiOperation({
    summary: 'Update user userMetadata data',
    description: 'Creates or updates user userMetadata data',
  })
  @ApiResponse({
    status: 200,
    description: 'User userMetadata updated successfully',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid userMetadata format',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  async updateUser(
    @AuthUser() user: AuthorizedUser,
    @Body() updateData: UserUpdateDto,
  ): Promise<UserResponseDto> {
    const userMetadataData = updateData.userMetadata ?? {};
    const userMetadata = await this.userMetadataModelService.createOrUpdate(
      user.id,
      userMetadataData,
    );

    return {
      ...user,
      userMetadata: { ...userMetadata },
    };
  }
}
