import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Ctx, type AppContextInterface } from '@concepta/nestjs-core';
import { AdminGuard } from '../admin/admin.guard';
import { AuditAction } from './audit-log.entity';
import { AuditListResult, AuditLogService } from './audit-log.service';

@ApiBearerAuth()
@ApiTags('Audit')
@Controller('admin/audit-logs')
@UseGuards(AdminGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'List audit rows (admin only)' })
  @ApiQuery({ name: 'resource', required: false })
  @ApiQuery({ name: 'resourceId', required: false })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction })
  async list(
    @Ctx() ctx: AppContextInterface,
    @Query('resource') resource?: string,
    @Query('resourceId') resourceId?: string,
    @Query('action') action?: AuditAction,
  ): Promise<AuditListResult> {
    return this.auditLogService.list(ctx, { resource, resourceId, action });
  }
}
