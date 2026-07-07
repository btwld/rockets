import { Injectable, type PlainLiteralObject, type Type } from '@nestjs/common';
import { type RepositoryInterface } from '@concepta/nestjs-repository';
import {
  EntityHook,
  type EntityHookContext,
  PassthroughEntityHookBase,
  getActor,
  getCrudContext,
} from '@bitwild/rockets-core';
import { AuditAction, AuditLogEntity } from './audit-log.entity';
import { InjectDynamicRepository } from '@bitwild/rockets-core';

/**
 * Repo hook that writes an `audit_logs` row after every mutating
 * operation on a decorated resource.
 *
 * ## Factory binding, not direct use
 *
 * Resources never list the abstract class directly. They list the
 * subclass produced by {@link AuditLogHook.for}:
 *
 * ```ts
 * hooks: [AuditLogHook.for(PetEntity)],
 * providers: [AuditLogHook.for(PetEntity)],
 * ```
 *
 * The subclass is decorated with `@EntityHook({ entity: PetEntity })`,
 * so the hook resolver only fires it on `pet` operations. When the
 * `afterCreate` body forwards `ctx` to `auditRepo.create(..., { ctx })`,
 * the nested write targets `audit_log` — the spec on the subclass
 * (`isEntity('pet')`) is unsatisfied, so the hook does NOT re-trigger.
 * Without entity scoping, that nested write would re-enter the same
 * hook, recurse without bound, and exhaust the Node heap. The factory
 * pattern makes the footgun impossible to hold.
 *
 * ## Why "after" rather than "before"
 *
 * The canonical post-write snapshot is what we want — cascades,
 * generated columns, default values, soft-delete flags are reflected
 * only once the adapter returns. A `beforeCreate`/`beforeUpdate` hook
 * would audit the incoming DTO, which is weaker evidence of what
 * actually happened.
 *
 * ## Why distinct overrides (`afterCreate`, `afterUpdate`, …)
 *
 * We need to record *which* write happened so the stored `action` is
 * accurate. A single "afterWrite" catch-all would lose that.
 */
@EntityHook()
@Injectable()
export abstract class AuditLogHook<
  E extends PlainLiteralObject,
> extends PassthroughEntityHookBase<E> {
  constructor(
    @InjectDynamicRepository(AuditLogEntity)
    protected readonly auditRepo: RepositoryInterface<AuditLogEntity>,
  ) {
    super();
  }

  override async afterCreate(result: E, ctx?: EntityHookContext): Promise<E> {
    await this.write(AuditAction.CREATE, result, ctx);
    return result;
  }

  override async afterUpdate(result: E, ctx?: EntityHookContext): Promise<E> {
    await this.write(AuditAction.UPDATE, result, ctx);
    return result;
  }

  override async afterDelete(result: E, ctx?: EntityHookContext): Promise<E> {
    await this.write(AuditAction.DELETE, result, ctx);
    return result;
  }

  override async afterSoftDelete(
    result: E,
    ctx?: EntityHookContext,
  ): Promise<E> {
    await this.write(AuditAction.SOFT_DELETE, result, ctx);
    return result;
  }

  override async afterRestore(result: E, ctx?: EntityHookContext): Promise<E> {
    await this.write(AuditAction.RESTORE, result, ctx);
    return result;
  }

  /**
   * Static factory binding the audit hook to a specific entity. The
   * returned subclass is decorated with `@EntityHook({ entity })` so
   * the hook only fires for that entity's operations — eliminating the
   * self-recursion footgun (audit rows triggering audits triggering
   * audits …). Each `(entity)` pair is cached so repeated calls return
   * the same NestJS provider token.
   */
  static for<E extends PlainLiteralObject>(
    entity: Type<E>,
  ): Type<AuditLogHook<E>>;
  static for(
    entity: Type<PlainLiteralObject>,
  ): Type<AuditLogHook<PlainLiteralObject>> {
    return getAuditLogSubclass(entity);
  }

  private async write(
    action: AuditAction,
    result: E,
    ctx?: EntityHookContext,
  ): Promise<void> {
    const crudCtx = getCrudContext(ctx);
    const actor = getActor(ctx);

    // Forward `ctx` so the audit insert joins the parent's transaction —
    // otherwise a parent rollback would leave an orphan audit row that
    // claims an operation that never persisted. Safe from recursion: the
    // subclass spec is `isEntity('<parent>')`, so the resolver will not
    // re-invoke us when the ctx's entity becomes `auditLog`.
    await this.auditRepo.create(
      {
        actorId: actor?.id ?? null,
        action,
        resource: crudCtx?.entity ?? 'unknown',
        resourceId:
          typeof (result as { id?: unknown })?.id === 'string'
            ? ((result as { id?: string }).id as string)
            : null,
        snapshot: safeStringify(result),
      },
      { ctx },
    );
  }
}

const auditLogSubclassCache = new Map<
  Type<PlainLiteralObject>,
  Type<AuditLogHook<PlainLiteralObject>>
>();

function getAuditLogSubclass(
  entity: Type<PlainLiteralObject>,
): Type<AuditLogHook<PlainLiteralObject>> {
  const existing = auditLogSubclassCache.get(entity);
  if (existing) return existing;

  const className = `AuditLogHook_${entity.name}`;
  const Subclass: Type<AuditLogHook<PlainLiteralObject>> = {
    [className]: class extends AuditLogHook<PlainLiteralObject> {},
  }[className] as Type<AuditLogHook<PlainLiteralObject>>;

  EntityHook({ entity })(Subclass);
  Injectable()(Subclass);

  auditLogSubclassCache.set(entity, Subclass);
  return Subclass;
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
