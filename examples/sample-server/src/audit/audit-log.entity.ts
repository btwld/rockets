import { z } from 'zod';
import { f, rocketsFieldMeta } from '@bitwild/rockets-core/zod';
import { zodEntityCompiler } from '../zod-bindings';

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  SOFT_DELETE = 'soft_delete',
  RESTORE = 'restore',
}

/**
 * Zod source of truth for the audit log (replaces the handwritten
 * `@Entity`). The write-side `AuditLogHook` and read-side
 * `AuditLogService` are unchanged — they inject `AuditLogEntity` (value)
 * and type rows by `AuditLogEntity` (the same-named row type below).
 */
export const auditLogSchema = z.object({
  id: f.pk(),
  /** Auth-user id that triggered the write. `null` for system / anonymous. */
  actorId: f.string({ max: 255, index: true }).nullable(),
  action: f.enum(AuditAction, { length: 20 }),
  /** Resource key (e.g. 'pet'). */
  resource: f.string({ max: 100, index: true }),
  resourceId: f.string({ max: 255, index: true }).nullable(),
  /**
   * JSON-encoded snapshot of the post-write entity. Stored as text rather
   * than a json column so it works unchanged against SQLite and pg/mysql.
   */
  snapshot: f.string({ text: true }).nullable(),
  dateCreated: z.date().register(rocketsFieldMeta, { db: { createdAt: true } }),
});

export const AuditLogEntity = zodEntityCompiler.compileEntity(auditLogSchema, {
  name: 'AuditLogEntity',
  table: 'audit_logs',
});
/** Persistence row type — shares the name with the entity class (value + type). */
export type AuditLogEntity = z.infer<typeof auditLogSchema>;
