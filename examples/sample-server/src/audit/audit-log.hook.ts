import { Injectable, PlainLiteralObject } from '@nestjs/common';
import {
  AfterCreate,
  AfterRestore,
  AfterSoftDelete,
  AfterUpdate,
  InjectDynamicRepository,
  RepoHook,
  RepositoryInterface,
} from '@bitwild/rockets-repository';
import type { CrudContextInterface } from '@bitwild/rockets-crud';
import { getAuthorizedUserFromCrudContext } from '@bitwild/rockets-core';
import { AuditAction, AuditLogEntity } from './audit-log.entity';
import { AUDIT_LOG_ENTITY_KEY } from './audit-log.constants';

/**
 * Repo hook that writes an `audit_logs` row after every mutating
 * operation on a decorated resource.
 *
 * Why "after" rather than "before": we want the canonical post-write
 * snapshot — post-processing (cascades, generated columns, default
 * values, soft-delete flags) is reflected only once the adapter returns.
 * A BeforeWrite hook would audit the incoming DTO, which is weaker
 * evidence of what actually happened.
 *
 * Why explicit per-op decorators (`@AfterCreate`, `@AfterUpdate`, etc.)
 * rather than a single `@AfterWrite`: we need to distinguish *which*
 * write happened so the stored `action` is accurate. `@AfterWrite` is a
 * catch-all that fires for creates and updates without differentiation.
 *
 * Apply via `@UseHooks(AuditLogHook)` on the resource, and list the
 * class in `resource.providers` so NestJS can instantiate it.
 */
@Injectable()
@RepoHook()
export class AuditLogHook {
  constructor(
    @InjectDynamicRepository(AUDIT_LOG_ENTITY_KEY)
    private readonly auditRepo: RepositoryInterface<AuditLogEntity>,
  ) {}

  @AfterCreate()
  async onCreate(
    result: PlainLiteralObject,
    ctx?: PlainLiteralObject,
  ): Promise<PlainLiteralObject> {
    await this.write(AuditAction.CREATE, result, ctx);
    return result;
  }

  @AfterUpdate()
  async onUpdate(
    result: PlainLiteralObject,
    ctx?: PlainLiteralObject,
  ): Promise<PlainLiteralObject> {
    await this.write(AuditAction.UPDATE, result, ctx);
    return result;
  }

  @AfterSoftDelete()
  async onSoftDelete(
    result: PlainLiteralObject,
    ctx?: PlainLiteralObject,
  ): Promise<PlainLiteralObject> {
    await this.write(AuditAction.SOFT_DELETE, result, ctx);
    return result;
  }

  @AfterRestore()
  async onRestore(
    result: PlainLiteralObject,
    ctx?: PlainLiteralObject,
  ): Promise<PlainLiteralObject> {
    await this.write(AuditAction.RESTORE, result, ctx);
    return result;
  }

  private async write(
    action: AuditAction,
    result: PlainLiteralObject,
    ctx?: PlainLiteralObject,
  ): Promise<void> {
    const crudCtx = ctx as CrudContextInterface | undefined;
    const authUser = ctx
      ? getAuthorizedUserFromCrudContext(
          ctx as CrudContextInterface<PlainLiteralObject>,
        )
      : undefined;

    await this.auditRepo.create({
      actorId: authUser?.id ?? null,
      action,
      resource: crudCtx?.entity ?? 'unknown',
      resourceId: (result?.id as string) ?? null,
      snapshot: safeStringify(result),
    });
  }
}

/**
 * Stringify with a circular-reference guard so audit rows never lose the
 * snapshot silently on entity graphs with back-refs (pet → tag → pet).
 * Returns a JSON string either way — never `null`, which would defeat
 * the audit's purpose.
 */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v as object)) return '[Circular]';
        seen.add(v as object);
      }
      return v;
    });
  } catch (e) {
    return JSON.stringify({
      serializationError: (e as Error).message ?? String(e),
    });
  }
}
