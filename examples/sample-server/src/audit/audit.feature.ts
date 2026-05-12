import { defineModuleResource } from '@bitwild/rockets-core';
import { AuditLogEntity } from './audit-log.entity';
import { AuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';

/**
 * Audit module resource: persistence + admin-only listing endpoint.
 *
 * The audit *hook* (`AuditLogHook`) is no longer registered here. The
 * hook is now a per-entity factory — each resource that wants auditing
 * adds `AuditLogHook.for(MyEntity)` to its own `hooks` and `providers`.
 * Registering the abstract base class globally would do nothing (it
 * cannot be instantiated) and listing every concrete subclass would
 * duplicate the same metadata across two module surfaces.
 *
 * `AuditLogController` uses `@UseGuards(AdminGuard)` — `AdminGuard`
 * reaches it through `adminFeature`'s `exports[]`, which
 * `RocketsCoreModule` re-exports globally. No explicit `imports[]`
 * line is needed.
 */
export const auditFeature = defineModuleResource({
  entities: [AuditLogEntity],
  controllers: [AuditLogController],
  providers: [AuditLogService],
  exports: [AuditLogService],
});
