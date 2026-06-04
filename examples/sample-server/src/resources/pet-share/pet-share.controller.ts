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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthUser,
  Ctx,
  type AppContextInterface,
} from '@bitwild/rockets-app';
import type { AuthorizedUser } from '@bitwild/rockets';
import { PetShareEntity } from './pet-share.entity';
import { PetShareCreateDto, PetShareResponseDto } from './pet-share.dto';
import { PetShareService } from './pet-share.service';

/**
 * Thin HTTP gateway. `@Ctx()` resolves the per-request `AppContextHost`
 * attached by the global overlay interceptor — the service receives the
 * same ctx object a CRUD handler would get, so
 * `TransactionScope.run(ctx, ...)` behaves uniformly across the app.
 */
@ApiTags('Pet shares')
@ApiBearerAuth()
@Controller('pets/:petId/share')
export class PetShareController {
  constructor(private readonly petShareService: PetShareService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Share a pet with another user (owner only)' })
  @ApiNotFoundResponse({ description: 'Pet not found or not owned by you' })
  async share(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', new ParseUUIDPipe()) petId: string,
    @AuthUser() authUser: AuthorizedUser,
    @Body() dto: PetShareCreateDto,
  ): Promise<PetShareResponseDto> {
    const share = await this.petShareService.share(ctx, {
      petId,
      actorUserId: authUser.id,
      targetUserId: dto.userId,
      permission: dto.permission,
    });
    return toResponse(share);
  }

  @Get()
  @ApiOperation({ summary: 'List shares for a pet (owner only)' })
  @ApiNotFoundResponse({ description: 'Pet not found or not owned by you' })
  async list(
    @Ctx() ctx: AppContextInterface,
    @Param('petId', new ParseUUIDPipe()) petId: string,
    @AuthUser() authUser: AuthorizedUser,
  ): Promise<PetShareResponseDto[]> {
    const shares = await this.petShareService.listForPet(
      ctx,
      petId,
      authUser.id,
    );
    return shares.map(toResponse);
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

function toResponse(share: PetShareEntity): PetShareResponseDto {
  return {
    id: share.id,
    petId: share.petId,
    userId: share.userId,
    permission: share.permission,
    dateCreated: share.dateCreated,
  };
}
