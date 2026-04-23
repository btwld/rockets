import { Injectable } from '@nestjs/common';
import type { AppContextInterface } from '@concepta/nestjs-common';
import {
  InjectDynamicRepository,
  RepositoryInterface,
  Where,
  type WhereClause,
} from '@bitwild/rockets-repository';
import { AuditAction, AuditLogEntity } from './audit-log.entity';
import { AUDIT_LOG_ENTITY_KEY } from './audit-log.constants';

export interface AuditQueryFilter {
  readonly resource?: string;
  readonly resourceId?: string;
  readonly action?: AuditAction;
}

export interface AuditListResult {
  readonly data: AuditLogEntity[];
  readonly total: number;
}

/**
 * Read-only application-layer service over the audit trail. Writes only
 * happen via `AuditLogHook` — no mutating method exists here, so the
 * audit log stays append-only by construction.
 */
@Injectable()
export class AuditLogService {
  constructor(
    @InjectDynamicRepository(AUDIT_LOG_ENTITY_KEY)
    private readonly auditRepo: RepositoryInterface<AuditLogEntity>,
  ) {}

  async list(
    ctx: AppContextInterface,
    filter: AuditQueryFilter,
  ): Promise<AuditListResult> {
    const clauses: WhereClause[] = [];
    if (filter.resource) {
      clauses.push(Where.eq<AuditLogEntity>('resource', filter.resource));
    }
    if (filter.resourceId) {
      clauses.push(Where.eq<AuditLogEntity>('resourceId', filter.resourceId));
    }
    if (filter.action) {
      clauses.push(Where.eq<AuditLogEntity>('action', filter.action));
    }

    const rows = await this.auditRepo.find({
      ...(clauses.length
        ? {
            where:
              clauses.length === 1 ? clauses[0] : Where.and(...clauses),
          }
        : {}),
      ctx,
    });
    return { data: rows, total: rows.length };
  }
}
