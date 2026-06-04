import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Ctx, type AppContextInterface } from '@bitwild/rockets-app';
import { PetEntity } from '../resources/pet/pet.entity';
import { AdminGuard } from './admin.guard';
import { AdminPetService, ListResult } from './admin-pet.service';

@ApiBearerAuth()
@ApiTags('Admin Pets')
@Controller('admin/pets')
@UseGuards(AdminGuard)
export class AdminPetController {
  constructor(private readonly adminPetService: AdminPetService) {}

  @Get()
  @ApiOperation({
    summary: 'List every pet in the system (admin only, owner scope bypassed)',
  })
  @ApiQuery({ name: 'withDeleted', required: false, type: Boolean })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async list(
    @Ctx() ctx: AppContextInterface,
    @Query('withDeleted') withDeleted?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ): Promise<ListResult> {
    // Hard cap prevents an admin request from pulling the whole table
    // into memory; default is intentionally modest.
    const MAX_LIMIT = 200;
    return this.adminPetService.list(ctx, {
      withDeleted: parseBool(withDeleted),
      limit: clampInt(limitRaw, 1, MAX_LIMIT, 50),
      offset: clampInt(offsetRaw, 0, Number.MAX_SAFE_INTEGER, 0),
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read any pet by id (admin only)' })
  async read(
    @Ctx() ctx: AppContextInterface,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('withDeleted') withDeleted?: string,
  ): Promise<PetEntity> {
    return this.adminPetService.read(ctx, id, parseBool(withDeleted));
  }

  @Patch(':id/force-restore')
  @ApiOperation({
    summary: 'Force-restore any pet regardless of owner (admin only)',
  })
  async forceRestore(
    @Ctx() ctx: AppContextInterface,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<PetEntity> {
    return this.adminPetService.forceRestore(ctx, id);
  }

  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hard-delete any pet (admin only, bypasses soft-delete)',
  })
  async hardDelete(
    @Ctx() ctx: AppContextInterface,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    await this.adminPetService.hardDelete(ctx, id);
  }
}

function parseBool(raw: string | undefined): boolean {
  return raw === 'true' || raw === '1';
}

function clampInt(
  raw: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
