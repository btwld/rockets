import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  SerializeOptions,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Ctx, type AppContextInterface } from '@concepta/nestjs-core';
import type { AuthorizedUser } from '@concepta/rockets';
import { AuthUser, rocketsSchemaValidation } from '@concepta/rockets-core';
import {
  petShareCreateSchema,
  petShareListResponseSchema,
  petShareResponseSchema,
  type PetShareCreateBody,
  type PetShareResponse,
} from './pet-share.schema';
import { PetShareService } from './pet-share.service';

/**
 * Thin HTTP gateway. `@Ctx()` resolves the per-request `AppContextHost`
 * attached by the global overlay interceptor — the service receives the
 * same ctx object a CRUD handler would get, so
 * `TransactionScope.run(ctx, ...)` behaves uniformly across the app.
 *
 * Validation and serialization run on Nest 12's native Standard Schema
 * path: the class-level pipe validates `@Body({ schema })` with the
 * Rockets exception factory, and the serializer interceptor projects each
 * share row through `petShareResponseSchema` (undeclared keys never leak).
 */
@ApiTags('Pet shares')
@ApiBearerAuth()
@Controller('pets/:petId/share')
@UsePipes(new StandardSchemaValidationPipe(rocketsSchemaValidation))
@UseInterceptors(StandardSchemaSerializerInterceptor)
@SerializeOptions({ schema: petShareResponseSchema })
export class PetShareController {
  constructor(private readonly petShareService: PetShareService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Share a pet with another user (owner only)' })
  @ApiResponse({ status: 201, standardSchema: petShareResponseSchema })
  @ApiNotFoundResponse({ description: 'Pet not found or not owned by you' })
  async share(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', new ParseUUIDPipe()) petId: string,
    @AuthUser() authUser: AuthorizedUser,
    @Body({ schema: petShareCreateSchema }) dto: PetShareCreateBody,
  ): Promise<PetShareResponse> {
    return this.petShareService.share(ctx, {
      petId,
      actorUserId: authUser.id,
      targetUserId: dto.userId,
      permission: dto.permission,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List shares for a pet (owner only)' })
  @ApiResponse({ status: 200, standardSchema: petShareListResponseSchema })
  @ApiNotFoundResponse({ description: 'Pet not found or not owned by you' })
  async list(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', new ParseUUIDPipe()) petId: string,
    @AuthUser() authUser: AuthorizedUser,
  ): Promise<PetShareResponse[]> {
    return this.petShareService.listForPet(ctx, petId, authUser.id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a pet share (owner only)' })
  @ApiNotFoundResponse({
    description: 'Pet not found, not owned by you, or share does not exist',
  })
  async revoke(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', new ParseUUIDPipe()) petId: string,
    @Param('userId', new ParseUUIDPipe()) targetUserId: string,
    @AuthUser() authUser: AuthorizedUser,
  ): Promise<void> {
    await this.petShareService.revoke(ctx, petId, targetUserId, authUser.id);
  }
}
