import {
  Body,
  Controller,
  Get,
  Patch,
  Req,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  type Type,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { z } from 'zod';
import {
  AuthUser,
  getAppContext,
  GetUserMetadataQuery,
  rocketsSchemaValidation,
  type AuthorizedUser,
  type RocketsUserMetadataConfig,
  type UserMetadataEntityInterface,
  UpsertUserMetadataCommand,
} from '@concepta/rockets-core';
import { meResponseSchema, meUpdateSchema } from './me.schemas';

/**
 * `/me` — the authorized user with their userMetadata row.
 *
 * A factory rather than a static class because both schemas depend on
 * the app's `userMetadata` config: the PATCH body validates with the
 * app's update schema (per-route Standard Schema pipe, Rockets exception
 * factory), and every response is serialized through the app's response
 * projection — the same engine generated CRUD runs on.
 */
export function buildMeController(
  config: Pick<RocketsUserMetadataConfig, 'updateSchema' | 'responseSchema'>,
): Type<unknown> {
  const updateSchema = meUpdateSchema(config.updateSchema);
  const responseSchema = meResponseSchema(config.responseSchema);
  type UpdateBody = z.output<typeof updateSchema>;

  @ApiTags('user')
  @ApiBearerAuth()
  @Controller('me')
  @UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
  @UseInterceptors(StandardSchemaSerializerInterceptor)
  @SerializeOptions({ schema: responseSchema })
  class MeController {
    constructor(
      private readonly commandBus: CommandBus,
      private readonly queryBus: QueryBus,
    ) {}

    @Get()
    @ApiOperation({
      summary: 'Get current user information',
      description:
        'Returns authenticated user data along with userMetadata data',
    })
    @ApiResponse({
      status: 200,
      description: 'User information retrieved successfully',
      standardSchema: responseSchema,
    })
    @ApiResponse({
      status: 401,
      description: 'Unauthorized - Invalid or missing token',
    })
    async me(
      @AuthUser() user: AuthorizedUser,
      @Req() req: Request,
    ): Promise<object> {
      const userMetadata = await this.queryBus.execute<
        GetUserMetadataQuery,
        UserMetadataEntityInterface | null
      >(new GetUserMetadataQuery(getAppContext(req), user.id));

      return { ...user, userMetadata };
    }

    @Patch()
    @ApiOperation({
      summary: 'Update user userMetadata data',
      description: 'Creates or updates user userMetadata data',
    })
    @ApiResponse({
      status: 200,
      description: 'User userMetadata updated successfully',
      standardSchema: responseSchema,
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
      @Body({ schema: updateSchema }) body: UpdateBody,
      @Req() req: Request,
    ): Promise<object> {
      const userMetadata = await this.commandBus.execute<
        UpsertUserMetadataCommand,
        UserMetadataEntityInterface
      >(
        new UpsertUserMetadataCommand(
          getAppContext(req),
          user.id,
          body.userMetadata ?? {},
        ),
      );

      return { ...user, userMetadata };
    }
  }

  return MeController;
}
