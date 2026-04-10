import {
  Controller,
  Get,
  Patch,
  Body,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { AuthUser } from '@bitwild/rockets-common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthorizedUser } from '@bitwild/rockets-core';
import {
  UpsertUserMetadataCommand,
  GetUserMetadataQuery,
  UserUpdateDto,
  UserResponseDto,
} from '@bitwild/rockets-core';
import type { UserMetadataEntityInterface } from '@bitwild/rockets-core';
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
    const userMetadata =
      await this.queryBus.execute<GetUserMetadataQuery, UserMetadataEntityInterface | null>(
        new GetUserMetadataQuery(user.id),
      );

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

    const { updateDto } = this.opts.userMetadata;
    if (updateDto) {
      const dtoInstance = plainToInstance(updateDto, userMetadataData);
      const errors = await validate(dtoInstance, {
        whitelist: true,
        forbidNonWhitelisted: false,
        forbidUnknownValues: true,
        skipMissingProperties: true,
      });
      if (errors.length > 0) {
        const messages = errors.flatMap((err) =>
          Object.values(err.constraints ?? {}),
        );
        throw new BadRequestException({
          statusCode: 400,
          message: messages,
          error: 'Bad Request',
        });
      }
    }

    const userMetadata =
      await this.commandBus.execute<UpsertUserMetadataCommand, UserMetadataEntityInterface>(
        new UpsertUserMetadataCommand(user.id, userMetadataData),
      );

    return {
      ...user,
      userMetadata: { ...userMetadata },
    };
  }
}
