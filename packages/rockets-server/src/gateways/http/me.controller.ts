import { Controller, Get, Patch, Body, Inject } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthUser, whitelistedFromDto } from '@bitwild/rockets-common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { AuthorizedUser } from '@bitwild/rockets-core';
import {
  UpsertUserMetadataCommand,
  GetUserMetadataQuery,
  UserUpdateDto,
  UserResponseDto,
} from '@bitwild/rockets-core';
import type {
  UserMetadataEntityInterface,
  UserMetadataUpdatableInterface,
} from '@bitwild/rockets-core';
import { RocketsOptionsInterface } from '../../infrastructure/config/interfaces/rockets-options.interface';
import { RAW_OPTIONS_TOKEN } from '../../rockets.tokens';

@ApiTags('user')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @Inject(RAW_OPTIONS_TOKEN)
    private readonly opts: RocketsOptionsInterface,
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
    const userMetadata = await this.queryBus.execute<
      GetUserMetadataQuery,
      UserMetadataEntityInterface | null
    >(new GetUserMetadataQuery(user.id));

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
    const payload = (await whitelistedFromDto(
      this.opts.userMetadata.updateDto,
      (updateData.userMetadata ?? {}) as object,
    )) as UserMetadataUpdatableInterface;

    const userMetadata = await this.commandBus.execute<
      UpsertUserMetadataCommand,
      UserMetadataEntityInterface
    >(new UpsertUserMetadataCommand(user.id, payload));

    return {
      ...user,
      userMetadata: { ...userMetadata },
    };
  }
}
