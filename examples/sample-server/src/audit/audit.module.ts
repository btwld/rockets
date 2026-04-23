import { Module } from '@nestjs/common';
import { AuditLogHook } from './audit-log.hook';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { AdminModule } from '../admin';

@Module({
  imports: [AdminModule],
  controllers: [AuditLogController],
  providers: [AuditLogHook, AuditLogService],
  exports: [AuditLogHook, AuditLogService],
})
export class AuditModule {}
